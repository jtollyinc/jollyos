/**
 * lib/brief/build — assemble the Daily Brief.
 * ────────────────────────────────────────────────────────────────────────────
 * Sources are pluggable: today there are RSS feeds (BRIEF_FEEDS) and demo
 * fixtures (DATA_DIR/brief-stories.json, seeded from demo/seed). Each source
 * becomes one section with a model-written summary; the owner's own jobs and
 * decisions become sections that need no model at all.
 *
 * Summaries go through the provider router with the persona attached, so they
 * are written for THIS reader — and local-only persona items are withheld when
 * only a cloud model is available (the brief says so in its footer).
 *
 * Personalisation (lib/persona/interests): stories are ranked by the derived
 * interests and demoted/hidden by avoid-topics with plain keyword matching on
 * this server — so local-only interests may rank, and are never put in a
 * cloud prompt: they become local-only segments the router withholds. Each
 * story carries a "why you're seeing this" line. Feed suggestions are
 * proposals only; the owner accepts each one.
 *
 * The result is cached per day in DATA_DIR/brief.json, keyed on the interest
 * profile version; "Refresh" rebuilds. SERVER-SIDE ONLY.
 */
import fs from "node:fs";
import { briefFeeds, isDemoMode } from "@/lib/config";
import { dataPath, readJson, writeJson } from "@/lib/data-dir";
import { jobCounts, readJobs } from "@/lib/jobs/store";
import { allCards, readAnswers } from "@/lib/persona/deck-store";
import { summariseSession } from "@/lib/persona/deck";
import { interestSegments, rankStories, suggestFeeds, type InterestProfile } from "@/lib/persona/interests";
import { readInterests } from "@/lib/persona/interests-store";
import { personaSegments, readEntries } from "@/lib/persona/store";
import { completeWithContext, providersFromEnv, type ProviderSet } from "@/lib/providers";
import { runtimeEnv } from "@/lib/settings/ai";
import { enabledFeedUrls, feedCatalog, readAcceptedFeeds } from "./feeds-store";
import { fetchFeed } from "./rss";
import type { Brief, BriefPersonal, BriefSection, BriefSource, Story } from "./types";

const MAX_SOURCES = 6;
const MAX_STORIES = 8;

interface FixtureFile {
  sources: { label: string; stories: Omit<Story, "source">[] }[];
}

const cacheFile = () => dataPath("brief.json");
const fixtureFile = () => dataPath("brief-stories.json");

const today = () => new Date().toISOString().slice(0, 10);

/** Valid only for today AND for the current interest profile. */
export function readCachedBrief(): Brief | null {
  const cached = readJson<Brief | null>(cacheFile(), null);
  if (!cached || cached.day !== today()) return null;
  if ((cached.interestsVersion ?? "none") !== readInterests().version) return null;
  return cached;
}

/** Accepting a feed or changing the persona makes the day cache stale on purpose. */
export function invalidateBriefCache(): void {
  try { fs.rmSync(cacheFile(), { force: true }); } catch { /* nothing to drop */ }
}

interface Collected {
  sections: { label: string; stories: Story[] }[];
  sources: BriefSource[];
}

async function collectStories(): Promise<Collected> {
  const sections: Collected["sections"] = [];
  const sources: BriefSource[] = [];

  if (isDemoMode()) {
    const fixtures = readJson<FixtureFile>(fixtureFile(), { sources: [] });
    for (const src of fixtures.sources.slice(0, MAX_SOURCES)) {
      const stories = src.stories.slice(0, MAX_STORIES).map((s) => ({ ...s, source: src.label }));
      sections.push({ label: src.label, stories });
      sources.push({ label: src.label, kind: "fixture", ok: true, count: stories.length });
    }
    return { sections, sources };
  }

  // Environment feeds first, then the ones the owner chose and left switched
  // on; never a suggestion itself.
  const urls = [...briefFeeds(), ...enabledFeedUrls()];
  const feeds = [...new Set(urls.map((u) => u.trim()))].filter(Boolean).slice(0, MAX_SOURCES);
  const results = await Promise.allSettled(feeds.map((url) => fetchFeed(url)));
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      const stories = r.value.stories.slice(0, MAX_STORIES);
      sections.push({ label: r.value.title, stories });
      sources.push({ label: r.value.title, kind: "rss", ok: true, count: stories.length });
    } else {
      sources.push({ label: feeds[i], kind: "rss", ok: false, count: 0, note: r.reason instanceof Error ? r.reason.message : String(r.reason) });
    }
  });
  return { sections, sources };
}

const SUMMARY_INSTRUCTIONS =
  "You write a short morning brief for one specific reader. Given a list of stories, write 2-4 bullet lines on what matters " +
  "to THIS reader and why, using the context about them below. Write in the reader's own voice: follow their stated preferences " +
  "for tone and length (short and direct if they say so), lead with what touches their interests, and skip their avoid topics. " +
  "No preamble, no headings, plain bullets starting with '- '.";

/** Attach rank, why-line and hidden flag to every story; hidden ones sort last. */
export function personaliseStories(stories: Story[], profile: InterestProfile): { stories: Story[]; hidden: number } {
  if (profile.version === "none") return { stories, hidden: 0 };
  const ranked = rankStories(stories, profile).map(({ match, ...s }) => ({ ...s, why: match.why, matched: match.matched, hidden: match.hidden }));
  return { stories: ranked, hidden: ranked.filter((s) => s.hidden).length };
}

export function personalSummary(profile: InterestProfile, hidden: number): BriefPersonal | null {
  if (profile.version === "none") return null;
  return {
    interests: profile.interests.length,
    avoid: profile.avoid.length,
    hidden,
    topics: profile.interests.map((i) => i.label),
    sources: [...new Set(profile.interests.flatMap((i) => i.sources))],
    localOnly: profile.interests.filter((i) => i.privacy === "local-only").length,
  };
}

export async function buildBrief(providers: ProviderSet = providersFromEnv(runtimeEnv())): Promise<Brief> {
  const { sections: raw, sources } = await collectStories();
  const profile = readInterests();
  // Persona entries plus one segment per interest, each with its own privacy
  // tag: the router withholds the local-only ones from a cloud model.
  const persona = [...personaSegments(readEntries()), ...interestSegments(profile)];

  // Interest labels that may be written into the PROMPT text itself. Local-only
  // labels never are: the prompt body is not a tagged segment, so the router
  // could not withhold them. (The owner still sees them in the why-line.)
  const promptSafe = new Set(profile.interests.filter((i) => i.privacy !== "local-only").map((i) => i.label));

  const sections: BriefSection[] = [];
  let provider = providers.default.label;
  let model = providers.default.model;
  let routeNote: string | null = null;
  let hiddenTotal = 0;

  for (const src of raw) {
    if (!src.stories.length) continue;
    const { stories, hidden } = personaliseStories(src.stories, profile);
    hiddenTotal += hidden;
    const visible = stories.filter((s) => !s.hidden);
    const list = visible.map((s) => {
      const tags = (s.matched ?? []).filter((m) => promptSafe.has(m));
      return `- ${s.title}${s.snippet ? ` — ${s.snippet}` : ""}${tags.length ? ` (matches: ${tags.join(", ")})` : ""}`;
    }).join("\n");
    let summary: string;
    try {
      const r = await completeWithContext(
        { instructions: SUMMARY_INSTRUCTIONS, segments: persona, prompt: `Stories from ${src.label}:\n${list || "- (every story here is on an avoid topic)"}`, kind: "brief", maxTokens: 600 },
        providers,
      );
      summary = r.text;
      provider = r.route.provider.label;
      model = r.model;
      if (r.route.dropped.length) routeNote = r.route.reason;
    } catch (err) {
      summary = `Summary unavailable: ${err instanceof Error ? err.message : String(err)}`;
    }
    const facts = [`${src.stories.length} stories`];
    const matched = stories.filter((s) => s.matched?.length).length;
    if (matched) facts.push(`${matched} for you`);
    if (hidden) facts.push(`${hidden} hidden`);
    sections.push({
      id: `src-${sections.length + 1}`,
      title: src.label,
      accent: "news",
      summary,
      stories,
      facts,
      hidden,
    });
  }

  // Sections that need no model.
  const jobs = readJobs();
  const counts = jobCounts(jobs);
  sections.unshift({
    id: "jobs",
    title: "Your jobs",
    accent: "jobs",
    summary: counts.inbox + counts.running === 0
      ? "Nothing waiting on the board."
      : `${counts.inbox} in the inbox, ${counts.running} running, ${counts.done} done.`,
    stories: [],
    facts: jobs.filter((j) => j.lane !== "done").slice(0, 5).map((j) => `${j.lane}: ${j.title}`),
  });

  const answers = readAnswers({ includePrivate: true });
  const reveal = summariseSession(answers, allCards());
  sections.push({
    id: "decisions",
    title: "Your decisions",
    accent: "decisions",
    summary: answers.length ? reveal.lines.join("\n") : "No swipes yet — the Decision Deck is waiting.",
    stories: [],
    facts: [`${answers.length} answered`, `${reveal.usedPrivate ? "includes local-only answers" : "cloud-safe only"}`],
  });

  const storyCount = raw.reduce((n, s) => n + s.stories.length, 0);
  const forYou = sections.reduce((n, s) => n + s.stories.filter((st) => st.matched?.length).length, 0);
  const headline = [
    storyCount ? `${storyCount} stories from ${raw.length} source${raw.length === 1 ? "" : "s"}${forYou ? `, ${forYou} for you` : ""}` : "No stories today",
    counts.inbox + counts.running ? `${counts.inbox + counts.running} job${counts.inbox + counts.running === 1 ? "" : "s"} need you` : "board is clear",
    `${answers.length} decisions on record`,
  ].join(" · ");

  // Proposals only: nothing here subscribes. Feeds already configured or accepted are excluded.
  const known = [...briefFeeds(), ...readAcceptedFeeds().map((f) => f.url)];
  const suggestions = suggestFeeds(feedCatalog(), profile, known);

  const brief: Brief = {
    generatedAt: new Date().toISOString(),
    day: today(),
    headline,
    sections,
    sources,
    provider,
    model,
    routeNote,
    personal: personalSummary(profile, hiddenTotal),
    suggestions,
    interestsVersion: profile.version,
  };
  writeJson(cacheFile(), brief);
  return brief;
}

export async function getBrief(opts: { refresh?: boolean } = {}): Promise<Brief> {
  if (!opts.refresh) {
    const cached = readCachedBrief();
    if (cached) return cached;
  }
  return buildBrief();
}
