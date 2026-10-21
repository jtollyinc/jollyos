/**
 * lib/onboarding/store — the walkthrough's progress and what it set up.
 * SERVER-SIDE ONLY (fs).
 * ────────────────────────────────────────────────────────────────────────────
 * One file, DATA_DIR/walkthrough.json, written after every step. That is what
 * makes the flow resumable on another device and what lets `complete` seed the
 * persona — localStorage could do neither.
 *
 * Re-running is a REPLACE, not an append: the ids of the persona entries and
 * the URLs of the feeds that `complete` created are remembered in `seeded`, and
 * the next completion removes them first. So "Run it again" cannot leave two
 * copies of "Call me Alex." behind. Anything the owner wrote by hand is never
 * touched.
 *
 * Every value that arrives from the browser goes through `sanitiseAnswers`;
 * nothing else in this module trusts its input.
 */
import { invalidateBriefCache } from "@/lib/brief/build";
import { acceptFeed, feedCatalog, readAcceptedFeeds, removeFeed } from "@/lib/brief/feeds-store";
import { dataPath, fileExists, readJson, writeJson } from "@/lib/data-dir";
import { createGoal, deleteGoal } from "@/lib/goals/store";
import { goalPrivacy, isGoalArea, isObstacle, type GoalAreaId } from "@/lib/goals/types";
import { readInterests } from "@/lib/persona/interests-store";
import { addEntry, deleteEntry } from "@/lib/persona/store";
import { readAiSettings } from "@/lib/settings/ai";
import { FIRST_STEP, LAST_STEP, isStepId } from "./steps";
import { MAX_SEEDED_FEEDS, walkthroughEntries, walkthroughFeeds } from "./seed";
import { ALL_PICKS, isSensitiveId } from "./topics";
import {
  BRIEF_LENGTHS,
  BRIEF_TONES,
  DEFAULT_ANSWERS,
  MAX_WALKTHROUGH_GOALS,
  type WalkthroughGoal,
  type WalkthroughAnswers,
  type WalkthroughReceipt,
  type WalkthroughState,
  type WalkthroughStatus,
} from "./types";

export const WALKTHROUGH_VERSION = 1;

const file = () => dataPath("walkthrough.json");

const EMPTY: WalkthroughState = {
  version: WALKTHROUGH_VERSION,
  status: "new",
  stepId: FIRST_STEP,
  answers: DEFAULT_ANSWERS,
  startedAt: null,
  updatedAt: null,
  completedAt: null,
  checklistDismissedAt: null,
  seeded: { entryIds: [], feedUrls: [], goalIds: [] },
};

const STATUSES: WalkthroughStatus[] = ["new", "in-progress", "skipped", "done"];
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const strings = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, max) : []);

/**
 * Goals from the browser. An older walkthrough.json holds a single string here
 * (the field this screen replaced), so anything that is not an array becomes an
 * empty list rather than a crash.
 */
export function sanitiseGoals(input: unknown): WalkthroughGoal[] {
  if (!Array.isArray(input)) return [];
  const out: WalkthroughGoal[] = [];
  for (const row of input.slice(0, MAX_WALKTHROUGH_GOALS)) {
    const g = (row ?? {}) as Partial<Record<keyof WalkthroughGoal, unknown>>;
    if (!isGoalArea(g.area)) continue;
    out.push({
      area: g.area as GoalAreaId,
      want: text(g.want, 160),
      why: text(g.why, 300),
      baselineNote: text(g.baselineNote, 300),
      obstacles: strings(g.obstacles, 9).filter(isObstacle),
      hoursClaimed: Math.max(0, Math.min(80, typeof g.hoursClaimed === "number" && Number.isFinite(g.hoursClaimed) ? g.hoursClaimed : 0)),
    });
  }
  return out;
}

/** Whatever the browser sent → a complete, valid answer set. Never throws. */
export function sanitiseAnswers(input: unknown, base: WalkthroughAnswers = DEFAULT_ANSWERS): WalkthroughAnswers {
  const raw = (input ?? {}) as Partial<Record<keyof WalkthroughAnswers, unknown>>;
  const has = (k: keyof WalkthroughAnswers) => Object.prototype.hasOwnProperty.call(raw, k);
  const pickIds = new Set(ALL_PICKS.map((p) => p.id));
  const time = text(raw.morningTime, 5);
  const ai = readAiSettings();
  return {
    name: has("name") ? text(raw.name, 60) : base.name,
    role: has("role") ? text(raw.role, 160) : base.role,
    goals: has("goals") ? sanitiseGoals(raw.goals) : base.goals,
    topics: has("topics") ? [...new Set(strings(raw.topics, 200).filter((t) => pickIds.has(t)))] : base.topics,
    interestsText: has("interestsText") ? text(raw.interestsText, 400) : base.interestsText,
    briefLength: BRIEF_LENGTHS.some((l) => l.id === raw.briefLength) ? (raw.briefLength as WalkthroughAnswers["briefLength"]) : base.briefLength,
    tone: BRIEF_TONES.some((t) => t.id === raw.tone) ? (raw.tone as WalkthroughAnswers["tone"]) : base.tone,
    morningTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : base.morningTime,
    localOnly: has("localOnly") ? [...new Set(strings(raw.localOnly, 10).filter(isSensitiveId))] : base.localOnly,
    // The brain choice is owned by lib/settings/ai (it is the thing with the
    // secret), so the walkthrough mirrors it instead of storing it twice.
    brain: ai.brain,
  };
}

export function readWalkthrough(): WalkthroughState {
  const raw = readJson<Partial<WalkthroughState> | null>(file(), null);
  if (!raw) return EMPTY;
  const seeded = (raw.seeded ?? {}) as Partial<WalkthroughState["seeded"]>;
  return {
    version: WALKTHROUGH_VERSION,
    status: STATUSES.includes(raw.status as WalkthroughStatus) ? (raw.status as WalkthroughStatus) : "new",
    stepId: isStepId(raw.stepId) ? (raw.stepId as string) : FIRST_STEP,
    answers: sanitiseAnswers(raw.answers, DEFAULT_ANSWERS),
    startedAt: text(raw.startedAt, 40) || null,
    updatedAt: text(raw.updatedAt, 40) || null,
    completedAt: text(raw.completedAt, 40) || null,
    checklistDismissedAt: text(raw.checklistDismissedAt, 40) || null,
    seeded: { entryIds: strings(seeded.entryIds, 200), feedUrls: strings(seeded.feedUrls, 50), goalIds: strings(seeded.goalIds, 20) },
  };
}

export const walkthroughStarted = (): boolean => fileExists(file());

function save(state: WalkthroughState): WalkthroughState {
  writeJson(file(), state);
  return state;
}

export interface PatchInput {
  stepId?: unknown;
  answers?: unknown;
}

/** Called on every Next/Back. Moves the resume point and merges the answers. */
export function patchWalkthrough(input: PatchInput): WalkthroughState {
  const now = new Date().toISOString();
  const current = readWalkthrough();
  const answers = input.answers === undefined ? current.answers : sanitiseAnswers(input.answers, current.answers);
  const stepId = isStepId(input.stepId) ? (input.stepId as string) : current.stepId;
  // A finished walkthrough that is edited again is in progress once more, but
  // "skipped" is a decision: tapping Next after a skip resumes it.
  const status: WalkthroughStatus = current.status === "done" ? "done" : "in-progress";
  return save({ ...current, status, stepId, answers, startedAt: current.startedAt ?? now, updatedAt: now });
}

export function skipWalkthrough(): WalkthroughState {
  const now = new Date().toISOString();
  const current = readWalkthrough();
  return save({ ...current, status: "skipped", startedAt: current.startedAt ?? now, updatedAt: now });
}

/** Back to screen one with the answers cleared. Also removes what the last run seeded. */
export function restartWalkthrough(): WalkthroughState {
  const current = readWalkthrough();
  unseed(current);
  const now = new Date().toISOString();
  return save({ ...EMPTY, startedAt: now, updatedAt: now, checklistDismissedAt: current.checklistDismissedAt, status: "in-progress" });
}

export function dismissChecklist(dismissed: boolean): WalkthroughState {
  const current = readWalkthrough();
  return save({ ...current, checklistDismissedAt: dismissed ? new Date().toISOString() : null, updatedAt: new Date().toISOString() });
}

/** Remove exactly what a previous completion created. Hand-written entries are safe. */
function unseed(state: WalkthroughState): void {
  for (const id of state.seeded.entryIds) deleteEntry(id);
  for (const id of state.seeded.goalIds ?? []) deleteGoal(id);
  const accepted = new Set(readAcceptedFeeds().map((f) => f.url.toLowerCase()));
  for (const url of state.seeded.feedUrls) if (accepted.has(url.toLowerCase())) removeFeed(url);
}

/**
 * The last screen's "Finish": write the persona entries, subscribe the feeds
 * the chosen topics imply, and drop the brief cache so the next read is
 * personalised. Returns a receipt for the finish screen.
 */
export function completeWalkthrough(patch: PatchInput = {}): { state: WalkthroughState; receipt: WalkthroughReceipt } {
  const current = patchWalkthrough({ ...patch, stepId: LAST_STEP });
  unseed(current);

  // Real goals, not a note about goals: the Coach reads these from day one.
  const goalIds = current.answers.goals
    .filter((g) => g.want.trim())
    .map((g) => createGoal({
      area: g.area,
      want: g.want,
      why: g.why,
      baselineNote: g.baselineNote,
      obstacles: g.obstacles,
      hoursClaimed: g.hoursClaimed,
      privacy: goalPrivacy(g.area, current.answers.localOnly),
    }).id);
  const entryIds = walkthroughEntries(current.answers).map((e) => addEntry(e).id);
  const feeds = walkthroughFeeds(current.answers, feedCatalog()).slice(0, MAX_SEEDED_FEEDS);
  const feedUrls: string[] = [];
  for (const f of feeds) {
    acceptFeed({ url: f.url, title: f.title, because: f.topics.slice(0, 3) });
    feedUrls.push(f.url);
  }
  invalidateBriefCache();

  const now = new Date().toISOString();
  const state = save({ ...current, status: "done", stepId: LAST_STEP, completedAt: now, updatedAt: now, seeded: { entryIds, feedUrls, goalIds } });
  return {
    state,
    receipt: {
      entries: entryIds.length,
      goals: goalIds.length,
      feeds: feeds.map((f) => ({ url: f.url, title: f.title })),
      localOnly: current.answers.localOnly,
      interests: readInterests().interests.length,
      brain: current.answers.brain,
    },
  };
}

/** True once the owner has either finished or deliberately skipped the tour. */
export const walkthroughFinished = (state: WalkthroughState = readWalkthrough()): boolean =>
  state.status === "done" || state.status === "skipped";
