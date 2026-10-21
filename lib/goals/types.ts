/**
 * lib/goals/types — what a goal and a check-in are. Client-safe (no fs).
 * ────────────────────────────────────────────────────────────────────────────
 * The point of this module is the thing people are worst at on their own:
 * being honest about the distance between what they said they would do and
 * what they did. So a goal records three things that can later be COMPARED,
 * not just stated:
 *
 *   want / why     the intention, in their words
 *   baseline       where they actually are today (a number when possible)
 *   hoursClaimed   what they said they could give it, per week
 *
 * A check-in records the same shape a week later. The gap between the two is
 * the whole feature (lib/goals/reality).
 *
 * Privacy: a goal in a protected area is tagged local-only, which keeps it out
 * of any hosted model and, like decisions, out of the cloud-safe file entirely.
 */
import type { Privacy } from "@/lib/providers/types";
import type { SensitiveId } from "@/lib/onboarding/topics";

export type GoalAreaId = "health" | "money" | "career" | "relationships" | "skills" | "creative" | "home" | "community";

export interface GoalArea {
  id: GoalAreaId;
  label: string;
  /** One line of what people usually mean by it. */
  hint: string;
  /** Which privacy category this area belongs to, when it belongs to one. */
  sensitive?: SensitiveId;
  /** Placeholder that shows the shape of a good answer. */
  example: string;
  /** Suggested unit for the baseline number. */
  unit: string;
}

export const GOAL_AREAS: readonly GoalArea[] = [
  { id: "health", label: "Health", hint: "Fitness, food, sleep, how you feel.", sensitive: "health", example: "Run 5k without stopping", unit: "km" },
  { id: "money", label: "Money", hint: "Earning, saving, debt, security.", sensitive: "finance", example: "Save three months of expenses", unit: "saved" },
  { id: "career", label: "Career", hint: "Work, craft, the next role.", example: "Ship the design system and get promoted", unit: "done" },
  { id: "relationships", label: "Relationships", hint: "Family, friends, your partner.", sensitive: "family", example: "See friends twice a month", unit: "visits" },
  { id: "skills", label: "Skills", hint: "Something you want to be able to do.", example: "Hold a 10-minute conversation in Spanish", unit: "minutes" },
  { id: "creative", label: "Creative", hint: "Making the thing you keep not making.", example: "Finish the first draft", unit: "words" },
  { id: "home", label: "Home", hint: "Where you live and how it works.", example: "Finish the spare room", unit: "% done" },
  { id: "community", label: "Community", hint: "People and places around you.", example: "Volunteer once a month", unit: "sessions" },
] as const;

export const areaById = (id: string): GoalArea | undefined => GOAL_AREAS.find((a) => a.id === id);
export const isGoalArea = (v: unknown): v is GoalAreaId => GOAL_AREAS.some((a) => a.id === v);

/** The honest reasons things do not happen. Chips, because naming one is easier than writing it. */
export const OBSTACLES: readonly { id: string; label: string }[] = [
  { id: "time", label: "No time" },
  { id: "energy", label: "No energy" },
  { id: "money", label: "Costs money" },
  { id: "know-how", label: "Do not know how" },
  { id: "starting", label: "Hard to start" },
  { id: "consistency", label: "Cannot keep it up" },
  { id: "people", label: "Other people" },
  { id: "health", label: "Health" },
  { id: "fear", label: "Nervous about it" },
] as const;

export const isObstacle = (v: unknown): boolean => OBSTACLES.some((o) => o.id === v);

export interface Goal {
  id: string;
  area: GoalAreaId;
  /** What they want, specifically. The headline. */
  want: string;
  /** Why it matters to them — the thing that survives a bad week. */
  why: string;
  /** Where they honestly are today, in plain words. */
  baselineNote: string;
  /** Optional number for the same thing, so progress can be measured. */
  baseline: number | null;
  target: number | null;
  unit: string;
  obstacles: string[];
  obstacleNote: string;
  /** Hours per week they said they can really give it. */
  hoursClaimed: number;
  /** The one small thing to do next. Derived when empty. */
  nextStep: string;
  privacy: Privacy;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export type DidIt = "yes" | "partly" | "no";

export interface CheckIn {
  id: string;
  goalId: string;
  at: string;
  /** ISO week key, so two check-ins in one week do not both count. */
  week: string;
  did: DidIt;
  /** Where the number stands now, same unit as the goal. */
  value: number | null;
  /** Hours actually spent that week. */
  hoursActual: number;
  blockers: string[];
  note: string;
  privacy: Privacy;
}

export const DID_LABELS: Record<DidIt, string> = { yes: "Yes", partly: "Partly", no: "No" };

/** ISO-ish week key (YYYY-Www) in UTC. Stable, sortable, and cheap. */
export function weekKey(iso: string | Date = new Date()): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Thursday of the current week decides the year (ISO 8601).
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Whole weeks between two instants, never negative. */
export const weeksBetween = (fromIso: string, to: number = Date.now()): number =>
  Math.max(0, Math.floor((to - Date.parse(fromIso)) / WEEK_MS));

/** A goal in a protected area never leaves the machine. */
export function goalPrivacy(area: GoalAreaId, protectedIds: string[]): Privacy {
  const sensitive = areaById(area)?.sensitive;
  return sensitive && protectedIds.includes(sensitive) ? "local-only" : "cloud-ok";
}
