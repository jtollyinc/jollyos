/**
 * Goals, check-ins and the reality check.
 *
 * The reality check is the part that has to be right: it tells somebody their
 * goal is not happening. Every verdict below is pinned to the numbers that
 * produce it, because a coaching tool that is wrong is worse than none.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { coachGoal } from "@/lib/goals/coach";
import { doneJobsByGoal, goalKeywords, matchGoals } from "@/lib/goals/match";
import { derivedNextStep, realityCheck } from "@/lib/goals/reality";
import { createGoal, readCheckIns, readGoals, recordCheckIn, updateGoal } from "@/lib/goals/store";
import { GOAL_AREAS, goalPrivacy, weekKey, weeksBetween, type CheckIn, type Goal } from "@/lib/goals/types";
import type { Provider } from "@/lib/providers/types";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "jollyos-goals-"));
  process.env.DATA_DIR = dir;
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

const WEEK = 7 * 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-03-02T09:00:00Z");

function goal(over: Partial<Goal> = {}): Goal {
  const createdAt = new Date(NOW - 8 * WEEK).toISOString();
  return {
    id: "g1", area: "creative", want: "Finish the first draft", why: "it has bothered me for years",
    baselineNote: "6,000 words in", baseline: 6000, target: 50000, unit: "words",
    obstacles: ["time"], obstacleNote: "", hoursClaimed: 5, nextStep: "",
    privacy: "cloud-ok", createdAt, updatedAt: createdAt, archivedAt: null, ...over,
  };
}

function checkIn(weeksAgo: number, over: Partial<CheckIn> = {}): CheckIn {
  const at = new Date(NOW - weeksAgo * WEEK).toISOString();
  return { id: `c${weeksAgo}`, goalId: "g1", at, week: weekKey(at), did: "yes", value: null, hoursActual: 5, blockers: [], note: "", privacy: "cloud-ok", ...over };
}

describe("the goals store", () => {
  it("writes a cloud-ok goal and a local-only goal to different files", () => {
    createGoal({ area: "career", want: "Get promoted", privacy: "cloud-ok" });
    createGoal({ area: "health", want: "Run 5k", privacy: "local-only" });

    expect(fs.existsSync(path.join(dir, "goals.json"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "private", "goals.json"))).toBe(true);
    // The split is the filesystem, not a filter: a cloud-safe read cannot see it.
    expect(readGoals({ includePrivate: false }).map((g) => g.want)).toEqual(["Get promoted"]);
    expect(readGoals({ includePrivate: true })).toHaveLength(2);
    expect(fs.readFileSync(path.join(dir, "goals.json"), "utf8")).not.toContain("Run 5k");
  });

  it("refuses a goal with nothing in it", () => {
    expect(() => createGoal({ area: "career", want: "   ", privacy: "cloud-ok" })).toThrow();
  });

  it("a check-in lands in its goal's own tier and inherits its tag", () => {
    const g = createGoal({ area: "health", want: "Run 5k", privacy: "local-only" });
    const row = recordCheckIn({ goalId: g.id, did: "yes", hoursActual: 2, value: 3 });
    expect(row!.privacy).toBe("local-only");
    expect(fs.existsSync(path.join(dir, "private", "checkins.jsonl"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "checkins.jsonl"))).toBe(false);
    expect(readCheckIns({ includePrivate: false })).toEqual([]);
    expect(readCheckIns({ includePrivate: true })).toHaveLength(1);
  });

  it("a check-in against an unknown goal writes nothing at all", () => {
    expect(recordCheckIn({ goalId: "nope", did: "yes" })).toBeNull();
    expect(readCheckIns({ includePrivate: true })).toEqual([]);
  });

  it("clamps absurd hours instead of trusting the client", () => {
    const g = createGoal({ area: "career", want: "Ship it", hoursClaimed: 9999, privacy: "cloud-ok" });
    expect(g.hoursClaimed).toBe(80);
    expect(recordCheckIn({ goalId: g.id, did: "yes", hoursActual: -5 })!.hoursActual).toBe(0);
  });

  it("archiving hides a goal without destroying its history", () => {
    const g = createGoal({ area: "career", want: "Ship it", privacy: "cloud-ok" });
    recordCheckIn({ goalId: g.id, did: "yes" });
    updateGoal(g.id, { archived: true });
    expect(readGoals({ includePrivate: true })).toHaveLength(0);
    expect(readCheckIns({ includePrivate: true })).toHaveLength(1);
  });

  it("moving a goal to local-only moves the row between files", () => {
    const g = createGoal({ area: "health", want: "Run 5k", privacy: "cloud-ok" });
    updateGoal(g.id, { privacy: "local-only" });
    expect(fs.readFileSync(path.join(dir, "goals.json"), "utf8")).not.toContain("Run 5k");
    expect(fs.readFileSync(path.join(dir, "private", "goals.json"), "utf8")).toContain("Run 5k");
  });

  it("privacy follows the area and the owner's protected list", () => {
    expect(goalPrivacy("health", ["health"])).toBe("local-only");
    expect(goalPrivacy("health", [])).toBe("cloud-ok");
    expect(goalPrivacy("career", ["health", "finance"])).toBe("cloud-ok");
    expect(goalPrivacy("money", ["finance"])).toBe("local-only");
    expect(goalPrivacy("relationships", ["family"])).toBe("local-only");
  });

  it("every area a goal can use is a real area with a unit", () => {
    for (const a of GOAL_AREAS) expect(a.unit.length, a.id).toBeGreaterThan(0);
  });
});

describe("week maths", () => {
  it("counts whole weeks and never goes negative", () => {
    expect(weeksBetween(new Date(NOW - 3 * WEEK).toISOString(), NOW)).toBe(3);
    expect(weeksBetween(new Date(NOW + WEEK).toISOString(), NOW)).toBe(0);
  });

  it("two check-ins in one week are one week of showing up", () => {
    const a = weekKey("2026-03-02T09:00:00Z");
    const b = weekKey("2026-03-05T09:00:00Z");
    expect(a).toBe(b);
    expect(weekKey("2026-03-09T09:00:00Z")).not.toBe(a);
  });
});

describe("the reality check", () => {
  it("says it is too new rather than inventing a verdict", () => {
    const r = realityCheck({ goal: goal({ createdAt: new Date(NOW - 3 * 86400000).toISOString() }), checkIns: [], now: NOW });
    expect(r.verdict).toBe("too-new");
    expect(r.adjustment.kind).toBe("keep");
  });

  it("on track: showing up, hours match, number moving", () => {
    const checkIns = [7, 6, 5, 4, 3, 2, 1].map((w, i) => checkIn(w, { id: `c${w}`, value: 6000 + i * 6000, hoursActual: 5 }));
    const r = realityCheck({ goal: goal(), checkIns, now: NOW });
    expect(r.verdict).toBe("on-track");
    expect(r.adjustment.kind).toBe("keep");
    expect(r.stats.progressPct).toBeGreaterThan(50);
  });

  it("overclaimed hours: names the multiple and shrinks the goal", () => {
    const checkIns = [7, 6, 5, 4, 3, 2, 1].map((w) => checkIn(w, { id: `c${w}`, hoursActual: 1, value: 6200 }));
    const r = realityCheck({ goal: goal({ hoursClaimed: 5 }), checkIns, now: NOW });
    expect(r.verdict).toBe("slipping");
    expect(r.adjustment.kind).toBe("shrink");
    expect(r.stats.overclaim).toBe(5);
    expect(r.headline).toContain("5h a week");
    expect(r.headline).toContain("1h");
  });

  it("missed weeks: counts them and asks for one named slot", () => {
    const checkIns = [7, 6].map((w) => checkIn(w, { id: `c${w}`, hoursActual: 5, value: 6100 }));
    const r = realityCheck({ goal: goal(), checkIns, now: NOW });
    expect(r.verdict).toBe("stalled");
    expect(r.adjustment.kind).toBe("replan");
    expect(r.stats.missedWeeks).toBe(6);
  });

  it("never checked in at all: says so plainly and offers to drop it", () => {
    const r = realityCheck({ goal: goal(), checkIns: [], now: NOW });
    expect(r.verdict).toBe("stalled");
    expect(r.adjustment.kind).toBe("drop");
    expect(r.headline).toContain("not one check-in");
  });

  it("stalled numbers despite the hours: changes the method, not the amount", () => {
    const checkIns = [7, 6, 5, 4, 3, 2, 1].map((w) => checkIn(w, { id: `c${w}`, hoursActual: 5, value: 6000 }));
    const r = realityCheck({ goal: goal(), checkIns, now: NOW });
    expect(r.verdict).toBe("stalled");
    expect(r.adjustment.kind).toBe("replan");
    expect(r.adjustment.line).toContain("Change one thing about how");
  });

  it("more no than yes: halves it", () => {
    const checkIns = [7, 6, 5, 4, 3, 2, 1].map((w, i) => checkIn(w, { id: `c${w}`, did: i < 5 ? "no" : "yes", hoursActual: 5, value: 6000 + i * 5000 }));
    const r = realityCheck({ goal: goal(), checkIns, now: NOW });
    expect(r.verdict).toBe("slipping");
    expect(r.adjustment.kind).toBe("shrink");
  });

  it("never flatters, and gives exactly one adjustment", () => {
    const cases = [[], [checkIn(1)], [7, 6, 5, 4, 3, 2, 1].map((w) => checkIn(w, { id: `c${w}`, hoursActual: 1 }))];
    for (const checkIns of cases) {
      const r = realityCheck({ goal: goal(), checkIns: checkIns as CheckIn[], now: NOW });
      expect(r.headline).not.toMatch(/!|well done|great|amazing|proud/i);
      expect(r.adjustment.line.length).toBeGreaterThan(0);
      expect(typeof r.adjustment.kind).toBe("string");
    }
  });

  it("counts finished jobs as evidence the owner did not have to type", () => {
    const r = realityCheck({ goal: goal(), checkIns: [checkIn(1)], jobsDone: 3, now: NOW });
    expect(r.stats.jobsDone).toBe(3);
    expect(r.facts.join(" ")).toContain("3 jobs finished against it");
  });

  it("the next step is the owner's when they wrote one", () => {
    const g = goal({ nextStep: "Write 500 words on Tuesday" });
    const r = realityCheck({ goal: g, checkIns: [], now: NOW });
    expect(derivedNextStep(g, r)).toBe("Write 500 words on Tuesday");
    expect(derivedNextStep(goal(), realityCheck({ goal: goal({ createdAt: new Date(NOW).toISOString() }), checkIns: [], now: NOW })))
      .toBe("Do your first check-in");
  });
});

// ── The privacy promise ────────────────────────────────────────────────────

function fakeProvider(id: Provider["id"], kind: Provider["kind"]): Provider & { calls: string[] } {
  const calls: string[] = [];
  return {
    id, kind, label: `${id} (fake)`, model: "fake", calls,
    async complete(req) { calls.push(`${req.system ?? ""}\n${req.prompt}`); return { text: "VERDICT: rewritten\nADJUST: do the thing", provider: id, model: "fake" }; },
  };
}

describe("coaching a private goal", () => {
  const SENTINEL = "zorbleweed";

  it("never reaches a hosted model, even when one is configured", async () => {
    const cloud = fakeProvider("anthropic", "cloud");
    const g = goal({ privacy: "local-only", want: `Finish the ${SENTINEL} draft` });
    const out = await coachGoal({ goal: g, checkIns: [checkIn(1)], now: NOW, providers: { default: cloud, local: null, warnings: [] } });

    expect(cloud.calls).toEqual([]);
    expect(out.voice).toBe("rules");
    expect(out.headlineText).toBe(out.headline);
    expect(out.note).toContain("local-only");
  });

  it("goes to the local model when there is one, with the whole goal", async () => {
    const cloud = fakeProvider("anthropic", "cloud");
    const local = fakeProvider("local", "local");
    const g = goal({ privacy: "local-only", want: `Finish the ${SENTINEL} draft` });
    const out = await coachGoal({ goal: g, checkIns: [checkIn(1)], now: NOW, providers: { default: cloud, local, warnings: [] } });

    expect(cloud.calls).toEqual([]);
    expect(local.calls.join(" ")).toContain(SENTINEL);
    expect(out.voice).toBe("model");
    expect(out.headlineText).toBe("rewritten");
  });

  it("a cloud-ok goal may use the default provider", async () => {
    const cloud = fakeProvider("anthropic", "cloud");
    const out = await coachGoal({ goal: goal(), checkIns: [checkIn(1)], now: NOW, providers: { default: cloud, local: null, warnings: [] } });
    expect(cloud.calls).toHaveLength(1);
    expect(out.voice).toBe("model");
  });

  it("the demo provider is never used to rewrite: the rules text is the product", async () => {
    const demo = fakeProvider("demo", "demo");
    const out = await coachGoal({ goal: goal(), checkIns: [checkIn(1)], now: NOW, providers: { default: demo, local: null, warnings: [] } });
    expect(demo.calls).toEqual([]);
    expect(out.voice).toBe("rules");
  });

  it("a model that answers rubbish falls back to the rules text, never to nothing", async () => {
    const cloud = fakeProvider("anthropic", "cloud");
    cloud.complete = async () => ({ text: "I am afraid I cannot do that", provider: "anthropic", model: "fake" });
    const out = await coachGoal({ goal: goal(), checkIns: [checkIn(1)], now: NOW, providers: { default: cloud, local: null, warnings: [] } });
    expect(out.voice).toBe("rules");
    expect(out.headlineText).toBe(out.headline);
  });

  it("a model that throws does not take the page down", async () => {
    const cloud = fakeProvider("anthropic", "cloud");
    cloud.complete = async () => { throw new Error("boom"); };
    const out = await coachGoal({ goal: goal(), checkIns: [checkIn(1)], now: NOW, providers: { default: cloud, local: null, warnings: [] } });
    expect(out.voice).toBe("rules");
    expect(out.note).toContain("boom");
  });

  it("works with no provider at all — the whole point", async () => {
    const out = await coachGoal({ goal: goal(), checkIns: [checkIn(1)], now: NOW, providers: { default: fakeProvider("demo", "demo"), local: null, warnings: [] } });
    expect(out.headlineText.length).toBeGreaterThan(10);
    expect(out.adjustmentText.length).toBeGreaterThan(10);
  });
});

describe("matching stories to goals", () => {
  it("needs two real words, so one common word cannot label a story", () => {
    const g = goal({ want: "Run a 5k without stopping", why: "stairs leave me out of breath" });
    expect(matchGoals({ title: "The best running shoes" }, [g])).toBeNull();
    // One keyword is not enough either; two distinct ones are.
    expect(matchGoals({ title: "Stopping is normal when you start out" }, [g])).toBeNull();
    expect(matchGoals({ title: "Stopping is normal when you start out", snippet: "training your breath" }, [g])).not.toBeNull();
  });

  it("drops stop-words and anything under four characters", () => {
    expect(goalKeywords(goal({ want: "Get the big one done", why: "" }))).not.toContain("the");
    expect(goalKeywords(goal({ want: "Get the big one done", why: "" }))).not.toContain("big");
  });

  it("picks the goal with the most hits", () => {
    const a = goal({ id: "a", want: "Learn Spanish conversation", why: "" });
    const b = goal({ id: "b", want: "Learn Spanish grammar properly", why: "conversation practice" });
    const m = matchGoals({ title: "Spanish conversation practice", snippet: "grammar" }, [a, b]);
    expect(m!.goalId).toBe("b");
  });

  it("returns nothing when there are no goals", () => {
    expect(matchGoals({ title: "Anything at all" }, [])).toBeNull();
  });
});

describe("jobs linked to a goal", () => {
  it("counts only the finished ones, per goal", () => {
    const jobs = [
      { lane: "done", goalId: "a" },
      { lane: "done", goalId: "a" },
      { lane: "done", goalId: "b" },
      { lane: "inbox", goalId: "a" },   // an intention, not evidence
      { lane: "running", goalId: "a" },
      { lane: "done", goalId: null },   // not linked to anything
      { lane: "done" },
    ];
    expect(doneJobsByGoal(jobs)).toEqual({ a: 2, b: 1 });
  });

  it("is empty when nothing is linked", () => {
    expect(doneJobsByGoal([{ lane: "done" }, { lane: "inbox" }])).toEqual({});
  });

  it("a linked finished job shows up in that goal's reality check", () => {
    const r = realityCheck({ goal: goal(), checkIns: [checkIn(1)], jobsDone: doneJobsByGoal([{ lane: "done", goalId: "g1" }])["g1"] ?? 0, now: NOW });
    expect(r.stats.jobsDone).toBe(1);
  });
});
