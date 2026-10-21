/**
 * lib/goals/reality — the objective reality check. PURE, client-safe, no AI.
 * ────────────────────────────────────────────────────────────────────────────
 * This is the part people cannot do for themselves: hold the stated goal next
 * to the recorded evidence and say the number out loud.
 *
 * It compares four things, in this order of bluntness:
 *   1. SHOWING UP   weeks since the goal started vs check-ins actually filed
 *   2. HOURS        hours claimed per week vs the median actually spent
 *   3. MOVEMENT     the baseline number vs the latest one, against the target
 *   4. DOING        how many check-ins said yes, partly or no
 * plus jobs finished against the goal, which is evidence the owner did not
 * have to type.
 *
 * Tone rules, deliberately encoded rather than left to a model:
 *  - lead with the gap and the number, never with encouragement;
 *  - no flattery, no "great job", no exclamation marks;
 *  - exactly ONE adjustment, and it must be actionable this week.
 *
 * An AI never decides any of this. lib/goals/coach may rewrite the wording,
 * and only the wording.
 */
import { weeksBetween, type CheckIn, type Goal } from "./types";

export type Verdict = "too-new" | "on-track" | "slipping" | "stalled";
export type AdjustmentKind = "keep" | "shrink" | "replan" | "drop";

export interface Adjustment {
  kind: AdjustmentKind;
  /** One concrete thing to do, this week. */
  line: string;
}

export interface RealityCheck {
  goalId: string;
  verdict: Verdict;
  /** The gap, with numbers. One sentence. */
  headline: string;
  /** The receipts, each a short line. */
  facts: string[];
  adjustment: Adjustment;
  /** Raw numbers, so the UI can draw them and the test can assert them. */
  stats: {
    weeks: number;
    checkIns: number;
    missedWeeks: number;
    hoursClaimed: number;
    hoursMedian: number;
    /** claimed / median, Infinity when nothing was ever logged. */
    overclaim: number;
    firstValue: number | null;
    latestValue: number | null;
    progressPct: number | null;
    yes: number;
    partly: number;
    no: number;
    jobsDone: number;
  };
}

export interface RealityInput {
  goal: Goal;
  checkIns: CheckIn[];
  /** Jobs linked to this goal that reached "done". */
  jobsDone?: number;
  now?: number;
}

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** How far the number has travelled from baseline toward target, 0-100. */
export function progressPct(goal: Goal, latest: number | null): number | null {
  if (goal.baseline === null || goal.target === null || latest === null) return null;
  const span = goal.target - goal.baseline;
  if (span === 0) return latest === goal.target ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round(((latest - goal.baseline) / span) * 100)));
}

export function realityCheck({ goal, checkIns, jobsDone = 0, now = Date.now() }: RealityInput): RealityCheck {
  const mine = checkIns
    .filter((c) => c.goalId === goal.id)
    .sort((a, b) => a.at.localeCompare(b.at));
  const weeks = weeksBetween(goal.createdAt, now);
  // One check-in per week counts, however many were filed.
  const weeksLogged = new Set(mine.map((c) => c.week)).size;
  const missedWeeks = Math.max(0, weeks - weeksLogged);

  const hours = mine.map((c) => c.hoursActual).filter((h) => Number.isFinite(h));
  const hoursMedian = round1(median(hours));
  const overclaim = hoursMedian > 0 ? round1(goal.hoursClaimed / hoursMedian) : goal.hoursClaimed > 0 ? Infinity : 1;

  const values = mine.map((c) => c.value).filter((v): v is number => typeof v === "number");
  const firstValue = values.length ? values[0] : goal.baseline;
  const latestValue = values.length ? values[values.length - 1] : null;
  const pct = progressPct(goal, latestValue);

  const yes = mine.filter((c) => c.did === "yes").length;
  const partly = mine.filter((c) => c.did === "partly").length;
  const no = mine.filter((c) => c.did === "no").length;

  const stats = { weeks, checkIns: mine.length, missedWeeks, hoursClaimed: goal.hoursClaimed, hoursMedian, overclaim, firstValue, latestValue, progressPct: pct, yes, partly, no, jobsDone };

  const facts: string[] = [];
  facts.push(weeks === 0 ? "Set up this week." : `${plural(weeks, "week")} since you set it; ${plural(weeksLogged, "check-in")}.`);
  if (hours.length) facts.push(`You said ${goal.hoursClaimed}h a week. The median you logged is ${hoursMedian}h.`);
  if (latestValue !== null && goal.target !== null) {
    facts.push(`${firstValue ?? goal.baseline ?? 0} → ${latestValue} ${goal.unit || ""}`.trim() + ` (target ${goal.target})${pct !== null ? `, ${pct}% of the way` : ""}.`);
  }
  if (mine.length) facts.push(`${yes} yes, ${partly} partly, ${no} no.`);
  if (jobsDone) facts.push(`${plural(jobsDone, "job")} finished against it.`);

  // ── Too new to judge ─────────────────────────────────────────────────────
  if (weeks < 2) {
    return {
      goalId: goal.id, verdict: "too-new", stats, facts,
      headline: weeks === 0
        ? "Too new to judge. Nothing to compare yet — that is fine."
        : "One week in. One more check-in and this can tell you something real.",
      adjustment: { kind: "keep", line: mine.length ? "Keep going and check in again next week." : "Do your first check-in, even if the answer is no." },
    };
  }

  // ── Not showing up at all ────────────────────────────────────────────────
  if (weeksLogged === 0) {
    return {
      goalId: goal.id, verdict: "stalled", stats, facts,
      headline: `${plural(weeks, "week")} and not one check-in. On the evidence, this is not a goal you are working on.`,
      adjustment: { kind: "drop", line: `Either drop it, or shrink it to something you would do this week — say ${Math.max(1, Math.round(goal.hoursClaimed / 4))}h instead of ${goal.hoursClaimed}h.` },
    };
  }

  const missRate = weeks > 0 ? missedWeeks / weeks : 0;
  const noRate = mine.length ? (no + partly * 0.5) / mine.length : 0;
  const moving = latestValue !== null && firstValue !== null && latestValue !== firstValue;
  const movingRightWay = pct === null ? moving : pct > 0;

  // ── Claimed far more time than was ever spent ────────────────────────────
  if (overclaim >= 2 && goal.hoursClaimed > 0) {
    const real = hoursMedian === 0 ? 0 : hoursMedian;
    return {
      goalId: goal.id, verdict: "slipping", stats, facts,
      headline: `You planned ${goal.hoursClaimed}h a week and have been spending ${real}h. That is ${overclaim === Infinity ? "none of it" : `${overclaim}× less than the plan`}, every week, for ${plural(weeks, "week")}.`,
      adjustment: { kind: "shrink", line: `Rewrite the goal around ${Math.max(1, Math.round(real) || 1)}h a week. A plan you actually follow beats one you keep failing.` },
    };
  }

  // ── Showing up less than half the weeks ──────────────────────────────────
  if (missRate > 0.5) {
    return {
      goalId: goal.id, verdict: "stalled", stats, facts,
      headline: `You have checked in ${weeksLogged} of ${plural(weeks, "week")}. The weeks you skip are the answer, not the ones you log.`,
      adjustment: { kind: "replan", line: "Put one 20-minute slot in the calendar for it this week, on a named day. Nothing bigger." },
    };
  }

  // ── Turning up, but the number is not moving ─────────────────────────────
  if (latestValue !== null && goal.target !== null && !movingRightWay && weeks >= 3) {
    return {
      goalId: goal.id, verdict: "stalled", stats, facts,
      headline: `${plural(weeks, "week")} in, ${hoursMedian}h a week, and the number has not moved from ${firstValue ?? goal.baseline}. The effort is real; the method is not working.`,
      adjustment: { kind: "replan", line: "Change one thing about how you are doing it this week — not how much." },
    };
  }

  // ── Saying no more often than yes ────────────────────────────────────────
  if (noRate >= 0.5) {
    return {
      goalId: goal.id, verdict: "slipping", stats, facts,
      headline: `Of ${plural(mine.length, "check-in")}, ${no} were a no and ${partly} a partly. More weeks miss than land.`,
      adjustment: { kind: "shrink", line: "Halve it. A smaller goal you hit rebuilds more than a big one you miss." },
    };
  }

  return {
    goalId: goal.id, verdict: "on-track", stats, facts,
    headline: pct !== null
      ? `On track: ${pct}% of the way, ${hoursMedian}h a week, ${weeksLogged} of ${plural(weeks, "week")} logged.`
      : `On track: ${weeksLogged} of ${plural(weeks, "week")} logged, ${hoursMedian}h a week.`,
    adjustment: { kind: "keep", line: "Keep the plan. Change nothing this week." },
  };
}

/** The one small thing to do next, when the owner has not written their own. */
export function derivedNextStep(goal: Goal, check: RealityCheck): string {
  if (goal.nextStep.trim()) return goal.nextStep.trim();
  if (check.verdict === "too-new" && check.stats.checkIns === 0) return "Do your first check-in";
  if (check.stats.missedWeeks > 0) return `Check in on "${goal.want}"`;
  const hours = Math.max(0.5, Math.min(goal.hoursClaimed || 1, 2));
  return `Spend ${hours === 1 ? "an hour" : `${hours}h`} on it this week`;
}
