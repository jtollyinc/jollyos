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
 * The result is cached per day in DATA_DIR/brief.json; "Refresh" rebuilds.
 * SERVER-SIDE ONLY.
 */
import { briefFeeds, isDemoMode } from "@/lib/config";
import { dataPath, readJson, writeJson } from "@/lib/data-dir";
import { jobCounts, readJobs } from "@/lib/jobs/store";
import { allCards, readAnswers } from "@/lib/persona/deck-store";
import { summariseSession } from "@/lib/persona/deck";
import { personaSegments, readEntries } from "@/lib/persona/store";
import { completeWithContext, providersFromEnv, type ProviderSet } from "@/lib/providers";
import { fetchFeed } from "./rss";
import type { Brief, BriefSection, BriefSource, Story } from "./types";

const MAX_SOURCES = 4;
const MAX_STORIES = 8;

interface FixtureFile {
  sources: { label: string; stories: Omit<Story, "source">[] }[];
}

const cacheFile = () => dataPath("brief.json");
const fixtureFile = () => dataPath("brief-stories.json");

const today = () => new Date().toISOString().slice(0, 10);

export function readCachedBrief(): Brief | null {
  const cached = readJson<Brief | null>(cacheFile(), null);
  return cached && cached.day === today() ? cached : null;
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

  const feeds = briefFeeds().slice(0, MAX_SOURCES);
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
  "to THIS reader and why, using the context about them below. No preamble, no headings, plain bullets starting with '- '.";

export async function buildBrief(providers: ProviderSet = providersFromEnv()): Promise<Brief> {
  const { sections: raw, sources } = await collectStories();
  const persona = personaSegments(readEntries());

  const sections: BriefSection[] = [];
  let provider = providers.default.label;
  let model = providers.default.model;
  let routeNote: string | null = null;

  for (const src of raw) {
    if (!src.stories.length) continue;
    const list = src.stories.map((s) => `- ${s.title}${s.snippet ? ` — ${s.snippet}` : ""}`).join("\n");
    let summary: string;
    try {
      const r = await completeWithContext(
        { instructions: SUMMARY_INSTRUCTIONS, segments: persona, prompt: `Stories from ${src.label}:\n${list}`, kind: "brief", maxTokens: 600 },
        providers,
      );
      summary = r.text;
      provider = r.route.provider.label;
      model = r.model;
      if (r.route.dropped.length) routeNote = r.route.reason;
    } catch (err) {
      summary = `Summary unavailable: ${err instanceof Error ? err.message : String(err)}`;
    }
    sections.push({
      id: `src-${sections.length + 1}`,
      title: src.label,
      accent: "news",
      summary,
      stories: src.stories,
      facts: [`${src.stories.length} stories`],
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
  const headline = [
    storyCount ? `${storyCount} stories from ${raw.length} source${raw.length === 1 ? "" : "s"}` : "No stories today",
    counts.inbox + counts.running ? `${counts.inbox + counts.running} job${counts.inbox + counts.running === 1 ? "" : "s"} need you` : "board is clear",
    `${answers.length} decisions on record`,
  ].join(" · ");

  const brief: Brief = {
    generatedAt: new Date().toISOString(),
    day: today(),
    headline,
    sections,
    sources,
    provider,
    model,
    routeNote,
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
