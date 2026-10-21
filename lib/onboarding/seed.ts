/**
 * lib/onboarding/seed — turn walkthrough answers into persona entries and feeds.
 * ────────────────────────────────────────────────────────────────────────────
 * PURE and client-safe, so the whole "what does step 3 actually configure?"
 * question is a unit test (tests/walkthrough.test.ts) and the finish screen can
 * preview the same thing the server will write.
 *
 * Two rules worth knowing:
 *  - Interests are written as ordinary persona entries ("I follow accessibility.").
 *    lib/persona/interests then derives the profile from the text, exactly as it
 *    does for an import. The walkthrough gets no special path into the Brief.
 *  - An interest in a protected category (Personal finance → Money) is tagged
 *    local-only, so the derived interest is local-only too and the provider
 *    router withholds it from any hosted model.
 */
import type { FeedCatalogEntry } from "@/lib/persona/interests";
import { goalPrivacy } from "@/lib/goals/types";
import type { EntryInput } from "@/lib/persona/types";
import type { Privacy } from "@/lib/providers/types";
import { BRIEF_LENGTHS, BRIEF_TONES, type WalkthroughAnswers } from "./types";
import { ALL_PICKS, SENSITIVE } from "./topics";

/**
 * At most this many feeds get subscribed by the walkthrough, however many
 * topics were tapped. lib/brief/build reads the same number of sources, so
 * nothing is subscribed that would never be fetched.
 */
export const MAX_SEEDED_FEEDS = 12;

const clean = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

export function walkthroughEntries(answers: WalkthroughAnswers): EntryInput[] {
  const out: EntryInput[] = [];
  const add = (kind: EntryInput["kind"], text: string, privacy: Privacy) => {
    if (text.trim()) out.push({ kind, text, privacy });
  };

  const name = clean(answers.name, 60);
  const role = clean(answers.role, 160);
  if (name) add("profile", `Call me ${name}.`, "cloud-ok");
  if (role) add("profile", `What I do: ${role}.`, "cloud-ok");
  // One line per goal, carrying the goal's own privacy: a health goal is
  // local-only when Health is protected, so Ask Myself and the Brief can use
  // it while a hosted model never sees it.
  for (const goal of answers.goals) {
    const want = clean(goal.want, 160);
    if (!want) continue;
    add("profile", `Right now I am working on: ${want}.`, goalPrivacy(goal.area, answers.localOnly));
  }

  // Interests, in catalog order so the result is stable. A pick inherits its
  // category's privacy tag (Money, Health, Local) unless it sets its own.
  const chosen = new Set(answers.topics);
  const protectedIds = answers.localOnly;
  for (const pick of ALL_PICKS) {
    if (!chosen.has(pick.id)) continue;
    const privacy: Privacy = pick.sensitiveId && protectedIds.includes(pick.sensitiveId) ? "local-only" : "cloud-ok";
    add("preference", `I follow ${pick.label.toLowerCase()}.`, privacy);
  }
  const free = clean(answers.interestsText, 400);
  if (free) add("preference", `I am into ${free}.`, "cloud-ok");

  // How they want to be written to. The Brief's summariser is told to follow these.
  const length = BRIEF_LENGTHS.find((l) => l.id === answers.briefLength);
  const tone = BRIEF_TONES.find((t) => t.id === answers.tone);
  if (length) add("preference", length.rule, "cloud-ok");
  if (tone) add("preference", tone.rule, "cloud-ok");
  if (/^\d{2}:\d{2}$/.test(answers.morningTime)) add("preference", `My morning block starts at ${answers.morningTime}.`, "cloud-ok");

  // Privacy: a real local-only rule per protected category.
  for (const cat of SENSITIVE) {
    if (protectedIds.includes(cat.id)) add("rule", cat.rule, "local-only");
  }
  return out;
}

/**
 * Feeds for what was tapped, SPECIFIC FIRST: a sub-pick ("Formula 1") beats the
 * broad chip above it ("Motorsport"), because somebody who bothered to pick the
 * specific thing wants that feed, not the category firehose. Deduped by feed id
 * and capped at MAX_SEEDED_FEEDS.
 *
 * Pure and deterministic — the same answers always seed the same list, which is
 * what lets the test assert it.
 */
export function walkthroughFeeds(answers: WalkthroughAnswers, catalog: FeedCatalogEntry[]): FeedCatalogEntry[] {
  const byId = new Map(catalog.map((f) => [f.id, f] as const));
  const chosen = new Set(answers.topics);
  const selected = ALL_PICKS.filter((p) => chosen.has(p.id));
  // Two passes over the same catalog order: sub-picks, then broad chips.
  const ordered = [...selected.filter((p) => p.parentId), ...selected.filter((p) => !p.parentId)];

  const picked: FeedCatalogEntry[] = [];
  const seen = new Set<string>();
  for (const pick of ordered) {
    for (const feedId of pick.feeds ?? []) {
      if (picked.length >= MAX_SEEDED_FEEDS) return picked;
      if (seen.has(feedId)) continue;
      const feed = byId.get(feedId);
      if (!feed) continue; // a stale id is caught by the catalog test, not here
      seen.add(feedId);
      picked.push(feed);
    }
  }
  return picked;
}

/** The labels a selection stands for, in catalog order, for the finish summary. */
export function chosenLabels(answers: WalkthroughAnswers): string[] {
  return ALL_PICKS.filter((p) => answers.topics.includes(p.id)).map((p) => p.label);
}
