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
import briefStories from "@/demo/seed/brief-stories.json";
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

  const cloudFile = dataPath("decisions.jsonl");
  const localFile = dataPath("private", "decisions.jsonl");
  if (!fileExists(cloudFile) && !fileExists(localFile)) {
    // Newest answer lands "yesterday", so the streak reads as alive, not broken.
    const answers = shiftDates(decisions.answers, recentOffset(decisions.answers, now - 24 * 60 * 60 * 1000));
    for (const a of answers) appendJsonl(a.privacy === "local-only" ? localFile : cloudFile, a);
  }

  fs.writeFileSync(marker(), JSON.stringify({ seededAt: new Date().toISOString(), fictional: true }) + "\n", "utf8");
  return true;
}
