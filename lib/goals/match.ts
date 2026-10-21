/**
 * lib/goals/match — does this story have anything to do with a goal?
 * PURE and client-safe, so the rule is testable without a brief or a model.
 * ────────────────────────────────────────────────────────────────────────────
 * Deliberately conservative keyword matching on the goal's own words: a story
 * labelled "For your goal: …" is a claim, and a wrong one is worse than no
 * label. Stop-words are dropped so "the" does not match everything, and a word
 * has to be at least four characters to count.
 *
 * Privacy mirrors the interests rule exactly (lib/persona/interests): a
 * local-only goal MAY rank and label a story here, because that is keyword
 * matching on the owner's own machine — but its text is never written into a
 * prompt body. lib/brief/build only annotates the model's story list with
 * cloud-safe goals.
 */
import type { Goal } from "./types";

const STOP = new Set([
  "the", "and", "for", "with", "from", "that", "this", "into", "your", "you", "about", "more", "less",
  "want", "will", "than", "then", "have", "when", "what", "some", "much", "very", "each", "every",
  "without", "stop", "start", "keep", "make", "take", "week", "month", "year", "day", "days", "time",
]);

/** The words worth matching on, lower-cased and de-duplicated. */
export function goalKeywords(goal: Goal): string[] {
  const words = `${goal.want} ${goal.why}`
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
  return [...new Set(words)];
}

export interface GoalMatch {
  goalId: string;
  /** The goal's headline, for the "For your goal: …" line. */
  want: string;
  privacy: Goal["privacy"];
  /** Which words hit, for the receipt. */
  hits: string[];
}

/** At least two distinct keyword hits, so one common word cannot label a story. */
export const MIN_HITS = 2;

export function matchGoals(story: { title: string; snippet?: string }, goals: Goal[]): GoalMatch | null {
  const text = `${story.title} ${story.snippet ?? ""}`.toLowerCase();
  let best: GoalMatch | null = null;
  for (const goal of goals) {
    const hits = goalKeywords(goal).filter((w) => text.includes(w));
    if (hits.length < MIN_HITS) continue;
    if (!best || hits.length > best.hits.length) best = { goalId: goal.id, want: goal.want, privacy: goal.privacy, hits };
  }
  return best;
}

/**
 * Finished jobs per goal. Evidence the owner did not have to type: they linked
 * a job to a goal and it reached "done". Only "done" counts — a job sitting in
 * the inbox is an intention, which is the thing the Coach is checking.
 */
export function doneJobsByGoal(jobs: readonly { lane: string; goalId?: string | null }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const job of jobs) {
    if (job.lane !== "done" || !job.goalId) continue;
    out[job.goalId] = (out[job.goalId] ?? 0) + 1;
  }
  return out;
}
