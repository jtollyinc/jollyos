/**
 * lib/demo — seed the fictional demo data on first start.
 * ────────────────────────────────────────────────────────────────────────────
 * When DEMO_MODE is on and DATA_DIR has never been seeded, the JSON under
 * demo/seed/ is copied into DATA_DIR (persona, jobs, brief stories, decisions)
 * and a marker file is written so it happens once. Nothing is overwritten:
 * each file is only written if it does not already exist, so edits made in the
 * demo survive a restart.
 *
 * Seed timestamps are shifted so the newest one is about an hour ago: the
 * fixtures were written on a fixed date, and a demo that says "231d ago"
 * reads as abandoned. Relative order between timestamps is preserved.
 *
 * Everything in demo/seed/ is fictional ("Alex Rivera") and says so.
 * SERVER-SIDE ONLY.
 */
import fs from "node:fs";
import { isDemoMode } from "@/lib/config";
import { appendJsonl, dataPath, fileExists, writeJson } from "@/lib/data-dir";
import { weekKey } from "@/lib/goals/types";
import briefStories from "@/demo/seed/brief-stories.json";
import checkins from "@/demo/seed/checkins.json";
import goals from "@/demo/seed/goals.json";
import decisions from "@/demo/seed/decisions.json";
import jobs from "@/demo/seed/jobs.json";
import persona from "@/demo/seed/persona.json";

const marker = () => dataPath("demo-seeded.json");

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

/** Every ISO timestamp inside a seed, for finding the newest one. */
function collectDates(value: unknown, out: number[] = []): number[] {
  if (typeof value === "string") {
    if (ISO_RE.test(value)) out.push(Date.parse(value));
  } else if (Array.isArray(value)) {
    for (const v of value) collectDates(v, out);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectDates(v, out);
  }
  return out;
}

/** Shift every ISO timestamp by the same offset. Pure; returns a deep copy. */
export function shiftDates<T>(value: T, offsetMs: number): T {
  if (typeof value === "string") {
    return (ISO_RE.test(value) ? new Date(Date.parse(value) + offsetMs).toISOString() : value) as T;
  }
  if (Array.isArray(value)) return value.map((v) => shiftDates(v, offsetMs)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, shiftDates(v, offsetMs)])) as T;
  }
  return value;
}

/** Offset that puts the newest timestamp in `seed` about an hour before `now`. */
export function recentOffset(seed: unknown, now = Date.now()): number {
  const dates = collectDates(seed);
  if (!dates.length) return 0;
  return now - 60 * 60 * 1000 - Math.max(...dates);
}

export function ensureDemoSeeded(): boolean {
  if (!isDemoMode()) return false;
  if (fileExists(marker())) return false;

  const now = Date.now();
  const writeIfMissing = (file: string, value: unknown) => {
    if (!fileExists(file)) writeJson(file, shiftDates(value, recentOffset(value, now)));
  };
  writeIfMissing(dataPath("persona.json"), persona);
  writeIfMissing(dataPath("jobs.json"), jobs);
  writeIfMissing(dataPath("brief-stories.json"), briefStories);
  // Goals + eight weeks of check-ins, so the Coach has something real to read:
  // one goal on track, one where the claimed hours never happened.
  //
  // Both files share ONE offset, taken from the newest CHECK-IN rather than the
  // newest goal. Anchoring on the goals would drag their createdAt to an hour
  // ago and every verdict would read "too new to judge"; anchoring on the
  // check-ins keeps the eight-week history the Coach needs.
  const goalOffset = recentOffset(checkins.checkIns, now);
  // NOT writeIfMissing: that helper shifts whatever it is given by the newest
  // date INSIDE it, which would drag the goals' createdAt to an hour ago and
  // make every verdict read "too new to judge". Goals and check-ins have to
  // move by the SAME offset, taken from the newest check-in, to keep the
  // eight-week history the Coach needs.
  const goalsPath = dataPath("goals.json");
  if (!fileExists(goalsPath)) writeJson(goalsPath, { goals: shiftDates(goals.goals, goalOffset) });
  if (!fileExists(dataPath("checkins.jsonl")) && !fileExists(dataPath("private", "checkins.jsonl"))) {
    for (const row of shiftDates(checkins.checkIns, goalOffset)) {
      // `week` is a key, not a timestamp, so shiftDates leaves it alone —
      // recompute it or every check-in claims to be from last winter.
      const moved = { ...row, week: weekKey(row.at) };
      appendJsonl(moved.privacy === "local-only" ? dataPath("private", "checkins.jsonl") : dataPath("checkins.jsonl"), moved);
    }
  }

  const cloudFile = dataPath("decisions.jsonl");
  const localFile = dataPath("private", "decisions.jsonl");
  if (!fileExists(cloudFile) && !fileExists(localFile)) {
    // Newest answer lands ~12 hours ago (today or yesterday in any timezone),
    // so the streak reads as alive, not broken.
    const answers = shiftDates(decisions.answers, recentOffset(decisions.answers, now - 11 * 60 * 60 * 1000));
    for (const a of answers) appendJsonl(a.privacy === "local-only" ? localFile : cloudFile, a);
  }

  fs.writeFileSync(marker(), JSON.stringify({ seededAt: new Date().toISOString(), fictional: true }) + "\n", "utf8");
  return true;
}
