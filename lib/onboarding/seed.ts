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
import type { EntryInput } from "@/lib/persona/types";
import type { Privacy } from "@/lib/providers/types";
import { BRIEF_LENGTHS, BRIEF_TONES, type WalkthroughAnswers } from "./types";
import { SENSITIVE, TOPIC_CHIPS, chipById } from "./topics";

/** At most this many feeds; lib/brief/build only reads six sources anyway. */
export const MAX_SEEDED_FEEDS = 6;
const PER_CHIP = 2;

const clean = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

export function walkthroughEntries(answers: WalkthroughAnswers): EntryInput[] {
  const out: EntryInput[] = [];
  const add = (kind: EntryInput["kind"], text: string, privacy: Privacy) => {
    if (text.trim()) out.push({ kind, text, privacy });
  };

  const name = clean(answers.name, 60);
  const role = clean(answers.role, 160);
  const goals = clean(answers.goals, 400);
  if (name) add("profile", `Call me ${name}.`, "cloud-ok");
  if (role) add("profile", `What I do: ${role}.`, "cloud-ok");
  if (goals) add("profile", `Right now I am focused on: ${goals}.`, "cloud-ok");

  // Interests, in chip order so the result is stable.
  const chosen = new Set(answers.topics);
  const protectedIds = answers.localOnly;
  for (const chip of TOPIC_CHIPS) {
    if (!chosen.has(chip.id)) continue;
    const privacy: Privacy = chip.sensitive && protectedIds.includes(chip.sensitive) ? "local-only" : "cloud-ok";
    add("preference", `I follow ${chip.label.toLowerCase()}.`, privacy);
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
 * Feeds for the chosen chips: up to two per chip, best coverage first, capped.
 * Deterministic — ties break on the title, so the same answers always seed the
 * same list (and the test can assert it).
 */
export function walkthroughFeeds(answers: WalkthroughAnswers, catalog: FeedCatalogEntry[]): FeedCatalogEntry[] {
  const picked: FeedCatalogEntry[] = [];
  const seen = new Set<string>();
  for (const id of TOPIC_CHIPS.map((c) => c.id)) {
    if (!answers.topics.includes(id)) continue;
    const chip = chipById(id)!;
    const wanted = new Set(chip.topics);
    const ranked = catalog
      .map((f) => ({ feed: f, hits: f.topics.filter((t) => wanted.has(t)).length }))
      .filter((r) => r.hits > 0)
      .sort((a, b) => b.hits - a.hits || a.feed.title.localeCompare(b.feed.title));
    let taken = 0;
    for (const r of ranked) {
      if (taken >= PER_CHIP || picked.length >= MAX_SEEDED_FEEDS) break;
      const key = r.feed.url.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push(r.feed);
      taken++;
    }
    if (picked.length >= MAX_SEEDED_FEEDS) break;
  }
  return picked;
}

/** The interest labels a chip selection stands for, for the finish summary. */
export function chosenLabels(answers: WalkthroughAnswers): string[] {
  return TOPIC_CHIPS.filter((c) => answers.topics.includes(c.id)).map((c) => c.label);
}
