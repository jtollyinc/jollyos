/**
 * lib/goals/store — goals and check-ins on disk. SERVER-SIDE ONLY (fs).
 * ────────────────────────────────────────────────────────────────────────────
 * Split by privacy the same way lib/persona/deck-store splits decisions, so a
 * cloud-safe read cannot pick up a private row by accident — the split is the
 * filesystem, not a filter:
 *
 *   DATA_DIR/goals.json              cloud-ok goals
 *   DATA_DIR/private/goals.json      local-only goals
 *   DATA_DIR/checkins.jsonl          cloud-ok check-ins
 *   DATA_DIR/private/checkins.jsonl  local-only check-ins
 *
 * A check-in inherits its goal's tag; a caller never names a tier.
 */
import crypto from "node:crypto";
import { appendJsonl, dataPath, readJson, readJsonl, writeJson } from "@/lib/data-dir";
import type { Privacy } from "@/lib/providers/types";
import { GOAL_AREAS, isGoalArea, isObstacle, weekKey, type CheckIn, type DidIt, type Goal, type GoalAreaId } from "./types";

const goalsFile = (privacy: Privacy) => (privacy === "local-only" ? dataPath("private", "goals.json") : dataPath("goals.json"));
const checkInsFile = (privacy: Privacy) => (privacy === "local-only" ? dataPath("private", "checkins.jsonl") : dataPath("checkins.jsonl"));

export interface ReadOptions {
  /** TRUE for the owner's own screens; FALSE for anything building a cloud prompt. */
  includePrivate: boolean;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const hours = (v: unknown): number => Math.max(0, Math.min(80, num(v) ?? 0));

function readTier(privacy: Privacy): Goal[] {
  return readJson<{ goals: Goal[] }>(goalsFile(privacy), { goals: [] }).goals;
}

export function readGoals(opts: ReadOptions): Goal[] {
  const rows = readTier("cloud-ok");
  if (opts.includePrivate) rows.push(...readTier("local-only"));
  return rows.filter((g) => !g.archivedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function readAllGoals(opts: ReadOptions): Goal[] {
  const rows = readTier("cloud-ok");
  if (opts.includePrivate) rows.push(...readTier("local-only"));
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export const getGoal = (id: string): Goal | null => readAllGoals({ includePrivate: true }).find((g) => g.id === id) ?? null;

export interface GoalInput {
  area: GoalAreaId;
  want: string;
  why?: string;
  baselineNote?: string;
  baseline?: number | null;
  target?: number | null;
  unit?: string;
  obstacles?: string[];
  obstacleNote?: string;
  hoursClaimed?: number;
  nextStep?: string;
  privacy: Privacy;
}

export function createGoal(input: GoalInput): Goal {
  const want = str(input.want, 160);
  if (!want) throw new Error("A goal needs something you want.");
  if (!isGoalArea(input.area)) throw new Error("Unknown life area.");
  const now = new Date().toISOString();
  const goal: Goal = {
    id: crypto.randomUUID(),
    area: input.area,
    want,
    why: str(input.why, 300),
    baselineNote: str(input.baselineNote, 300),
    baseline: num(input.baseline),
    target: num(input.target),
    unit: str(input.unit, 24) || GOAL_AREAS.find((a) => a.id === input.area)?.unit || "",
    obstacles: (input.obstacles ?? []).filter(isObstacle).slice(0, 9),
    obstacleNote: str(input.obstacleNote, 300),
    hoursClaimed: hours(input.hoursClaimed),
    nextStep: str(input.nextStep, 160),
    privacy: input.privacy === "local-only" ? "local-only" : "cloud-ok",
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
  const tier = readTier(goal.privacy);
  writeJson(goalsFile(goal.privacy), { goals: [...tier, goal] });
  return goal;
}

export function updateGoal(id: string, patch: Partial<GoalInput> & { archived?: boolean }): Goal | null {
  const existing = getGoal(id);
  if (!existing) return null;
  const next: Goal = { ...existing, updatedAt: new Date().toISOString() };
  if (patch.want !== undefined) next.want = str(patch.want, 160) || next.want;
  if (patch.why !== undefined) next.why = str(patch.why, 300);
  if (patch.baselineNote !== undefined) next.baselineNote = str(patch.baselineNote, 300);
  if (patch.baseline !== undefined) next.baseline = num(patch.baseline);
  if (patch.target !== undefined) next.target = num(patch.target);
  if (patch.unit !== undefined) next.unit = str(patch.unit, 24);
  if (patch.obstacles !== undefined) next.obstacles = patch.obstacles.filter(isObstacle).slice(0, 9);
  if (patch.obstacleNote !== undefined) next.obstacleNote = str(patch.obstacleNote, 300);
  if (patch.hoursClaimed !== undefined) next.hoursClaimed = hours(patch.hoursClaimed);
  if (patch.nextStep !== undefined) next.nextStep = str(patch.nextStep, 160);
  if (patch.archived !== undefined) next.archivedAt = patch.archived ? new Date().toISOString() : null;

  // Changing the privacy tier means moving the row between files.
  const movingTo = patch.privacy && patch.privacy !== existing.privacy ? patch.privacy : null;
  const writeTier = (privacy: Privacy, goals: Goal[]) => writeJson(goalsFile(privacy), { goals });
  if (movingTo) {
    next.privacy = movingTo;
    writeTier(existing.privacy, readTier(existing.privacy).filter((g) => g.id !== id));
    writeTier(movingTo, [...readTier(movingTo), next]);
  } else {
    writeTier(next.privacy, readTier(next.privacy).map((g) => (g.id === id ? next : g)));
  }
  return next;
}

export function deleteGoal(id: string): boolean {
  const existing = getGoal(id);
  if (!existing) return false;
  writeJson(goalsFile(existing.privacy), { goals: readTier(existing.privacy).filter((g) => g.id !== id) });
  return true;
}

// ── Check-ins ──────────────────────────────────────────────────────────────

export function readCheckIns(opts: ReadOptions): CheckIn[] {
  const rows = readJsonl<CheckIn>(checkInsFile("cloud-ok"));
  if (opts.includePrivate) rows.push(...readJsonl<CheckIn>(checkInsFile("local-only")));
  return rows.sort((a, b) => a.at.localeCompare(b.at));
}

export interface CheckInInput {
  goalId: string;
  did: DidIt;
  value?: number | null;
  hoursActual?: number;
  blockers?: string[];
  note?: string;
}

/** Records against the goal's own tier. Unknown goal → null, never a stray row. */
export function recordCheckIn(input: CheckInInput, now = new Date()): CheckIn | null {
  const goal = getGoal(input.goalId);
  if (!goal) return null;
  const did: DidIt = input.did === "yes" || input.did === "partly" || input.did === "no" ? input.did : "no";
  const row: CheckIn = {
    id: crypto.randomUUID(),
    goalId: goal.id,
    at: now.toISOString(),
    week: weekKey(now),
    did,
    value: num(input.value),
    hoursActual: hours(input.hoursActual),
    blockers: (input.blockers ?? []).filter(isObstacle).slice(0, 9),
    note: str(input.note, 400),
    privacy: goal.privacy,
  };
  appendJsonl(checkInsFile(goal.privacy), row);
  return row;
}

/** Has this goal been checked in on during the current week? */
export function checkedInThisWeek(goalId: string, checkIns: CheckIn[], now = new Date()): boolean {
  const key = weekKey(now);
  return checkIns.some((c) => c.goalId === goalId && c.week === key);
}

export const goalCounts = (goals: Goal[]) => ({
  total: goals.length,
  localOnly: goals.filter((g) => g.privacy === "local-only").length,
});
