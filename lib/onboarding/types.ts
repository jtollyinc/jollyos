/**
 * lib/onboarding/types — the welcome walkthrough's shapes.
 * ────────────────────────────────────────────────────────────────────────────
 * Client-safe (no fs). The walkthrough is seven short screens; its answers are
 * the only thing that needs to survive a reload, so they live in ONE file,
 * DATA_DIR/walkthrough.json, written after every step (lib/onboarding/store).
 * localStorage would lose the progress on another device and could not seed the
 * persona, so it is not used at all.
 *
 * `status` is the whole resume rule:
 *   new          never opened — Home offers the tour
 *   in-progress  opened; `stepId` is where to resume
 *   skipped      the owner said "not now" — Home still offers it, quietly
 *   done         finished; Home shows the Getting started checklist instead
 */

import type { GoalAreaId } from "@/lib/goals/types";

export type WalkthroughStatus = "new" | "in-progress" | "skipped" | "done";

/** At most this many goals from the walkthrough. One good one beats three wishes. */
export const MAX_WALKTHROUGH_GOALS = 3;

/**
 * A goal as the walkthrough collects it. Deliberately the same five questions
 * the Goals page asks, so there is one definition of a goal in the product:
 * what, why, where you actually are, what stops you, and the hours you can
 * really give it. The last one is what the Coach later checks you against.
 */
export interface WalkthroughGoal {
  area: GoalAreaId;
  want: string;
  why: string;
  baselineNote: string;
  obstacles: string[];
  hoursClaimed: number;
}

export const EMPTY_GOAL = (area: GoalAreaId): WalkthroughGoal => ({ area, want: "", why: "", baselineNote: "", obstacles: [], hoursClaimed: 2 });

/** How long the Daily Brief's summaries should be. */
export type BriefLength = "short" | "medium" | "long";
/** How they should read. */
export type BriefTone = "direct" | "warm" | "plain";
/** Which model answers: none at all, one on this machine, or a hosted key. */
export type BrainChoice = "none" | "local" | "api";

export const BRIEF_LENGTHS: { id: BriefLength; label: string; hint: string; rule: string }[] = [
  { id: "short", label: "Short", hint: "3 bullets, nothing else", rule: "Keep my brief short: at most 3 bullets per section." },
  { id: "medium", label: "Medium", hint: "a short paragraph per section", rule: "Keep my brief medium: about 4 bullets per section." },
  { id: "long", label: "Full", hint: "everything that matched", rule: "Give me the full brief: cover everything that matched my interests." },
];

export const BRIEF_TONES: { id: BriefTone; label: string; hint: string; rule: string }[] = [
  { id: "direct", label: "Direct", hint: "no filler, lead with the action", rule: "Write to me in a direct tone: no filler, no preamble, lead with the action." },
  { id: "warm", label: "Warm", hint: "friendly, a little encouragement", rule: "Write to me in a warm tone: friendly and encouraging, never stern." },
  { id: "plain", label: "Plain", hint: "neutral and factual", rule: "Write to me in a plain, neutral tone: facts, no opinion." },
];

export interface WalkthroughAnswers {
  /** What to call them. Not a login name. */
  name: string;
  /** What they do, one line. */
  role: string;
  /** 1-3 goals, the spine the rest of the app hangs off. */
  goals: WalkthroughGoal[];
  /** Topic chip ids (lib/onboarding/topics). */
  topics: string[];
  /** Anything the chips missed, in their own words. */
  interestsText: string;
  briefLength: BriefLength;
  tone: BriefTone;
  /** "07:00" — when their morning block starts. */
  morningTime: string;
  /** Sensitive category ids that must stay on this machine. */
  localOnly: string[];
  brain: BrainChoice;
}

export const DEFAULT_ANSWERS: WalkthroughAnswers = {
  name: "",
  role: "",
  goals: [],
  topics: [],
  interestsText: "",
  briefLength: "short",
  tone: "direct",
  morningTime: "07:00",
  // The four categories in SENSITIVE whose defaultOn is true. Kept literal so
  // a fresh file is privacy-on without reading another module.
  localOnly: ["finance", "health", "family", "location"],
  brain: "none",
};

/** What applying the answers created, so re-running replaces instead of duplicating. */
export interface WalkthroughSeeded {
  entryIds: string[];
  feedUrls: string[];
  /** Goal ids, so a re-run replaces them instead of stacking duplicates. */
  goalIds: string[];
}

export interface WalkthroughState {
  version: number;
  status: WalkthroughStatus;
  /** Where to resume. Always a real step id. */
  stepId: string;
  answers: WalkthroughAnswers;
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  /** The Getting started checklist on Home is dismissible. */
  checklistDismissedAt: string | null;
  seeded: WalkthroughSeeded;
}

/** What `complete` set up, for the finish screen and the report. */
export interface WalkthroughReceipt {
  entries: number;
  goals: number;
  feeds: { url: string; title: string }[];
  localOnly: string[];
  interests: number;
  brain: BrainChoice;
}
