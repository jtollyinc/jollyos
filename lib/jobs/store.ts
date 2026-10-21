/**
 * lib/jobs/store — the Jobs board's cards. SERVER-SIDE ONLY (fs).
 * ────────────────────────────────────────────────────────────────────────────
 * A job is a card with a lane (inbox → running → done | failed | blocked), a
 * runner, a progress figure and an output. Capture creates one in the inbox; a
 * runner moves it along (lib/jobs/runners). Storage: DATA_DIR/jobs.json.
 *
 * `settle` is applied on every read so time-based runners (the demo one)
 * advance without any background process, and a CLI run that lost its process
 * (server restart) is marked failed instead of spinning forever.
 */
import crypto from "node:crypto";
import { dataPath, readJson, writeJson } from "@/lib/data-dir";

import { briefIsPrivate, stripPrivateTag, type Job, type JobLane } from "./types";

export * from "./types";

interface JobsFile {
  jobs: Job[];
}

const file = () => dataPath("jobs.json");
const LANE_SET = new Set<JobLane>(["inbox", "running", "done", "failed", "blocked"]);

/** Older files predate `private` / `blockedReason` / `model`; fill them in on read. */
function normalise(raw: Partial<Job> & { id: string; title: string }): Job {
  const brief = typeof raw.brief === "string" ? raw.brief : "";
  return {
    id: raw.id,
    title: raw.title,
    brief,
    lane: raw.lane && LANE_SET.has(raw.lane) ? raw.lane : "inbox",
    runner: raw.runner ?? null,
    private: typeof raw.private === "boolean" ? raw.private : briefIsPrivate(brief),
    blockedReason: raw.blockedReason ?? null,
    model: raw.model ?? null,
    progress: typeof raw.progress === "number" ? raw.progress : 0,
    output: raw.output ?? null,
    error: raw.error ?? null,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    startedAt: raw.startedAt ?? null,
    finishedAt: raw.finishedAt ?? null,
    simulatedMs: raw.simulatedMs,
    log: Array.isArray(raw.log) ? raw.log : [],
  };
}

function readRaw(): Job[] {
  return readJson<JobsFile>(file(), { jobs: [] }).jobs.map(normalise);
}

function writeAll(jobs: Job[]): void {
  writeJson(file(), { jobs });
}

// ── in-process run handles (the CLI runner) ─────────────────────────────────

interface RunHandles { __jobRuns?: Map<string, { kill(): void }> }
const g = globalThis as unknown as RunHandles;
export const runHandles = (): Map<string, { kill(): void }> => (g.__jobRuns ??= new Map());

const ORPHAN_GRACE_MS = 20_000;

/** Lanes derived from elapsed time for the demo runner; orphaned CLI runs fail honestly. Pure except the handle map. */
export function settle(job: Job, now = Date.now()): Job {
  if (job.lane !== "running" || !job.startedAt) return job;
  if (job.runner === "demo") {
    const elapsed = now - Date.parse(job.startedAt);
    const total = job.simulatedMs ?? 8000;
    if (elapsed < total) return { ...job, progress: Math.min(99, Math.floor((elapsed / total) * 100)) };
    return {
      ...job,
      lane: "done",
      progress: 100,
      finishedAt: new Date(Date.parse(job.startedAt) + total).toISOString(),
      output: job.output ?? demoOutput(job),
      log: [...job.log, { at: new Date().toISOString(), line: "Demo runner finished." }],
    };
  }
  if (job.runner === "cli" && !runHandles().has(job.id) && now - Date.parse(job.startedAt) > ORPHAN_GRACE_MS) {
    return {
      ...job, lane: "failed", progress: 0, finishedAt: new Date(now).toISOString(),
      error: "The server restarted while this CLI run was in progress. Run it again.",
      log: [...job.log, { at: new Date(now).toISOString(), line: "Lost the CLI process (server restart)." }],
    };
  }
  return job;
}

function demoOutput(job: Job): string {
  return [
    `Simulated run for: ${job.title}`,
    "",
    "- Broke the brief into three steps",
    "- Did the first one",
    "- Left the next step as a note on this card",
    "",
    "_(Demo runner: no model was called. Pick another runner to use a real one.)_",
  ].join("\n");
}

export function readJobs(): Job[] {
  const now = Date.now();
  const raw = readRaw();
  const settled = raw.map((j) => settle(j, now));
  // Persist lane changes so done jobs stay done even if the clock moves.
  if (settled.some((j, i) => j.lane !== raw[i].lane)) writeAll(settled);
  return settled.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getJob(id: string): Job | null {
  return readJobs().find((j) => j.id === id) ?? null;
}

export interface CreateJobInput {
  title: string;
  brief?: string;
  /** The lock on the new-job sheet; a PRIVACY: local-only line in the text means the same. */
  private?: boolean;
  /** Optional: the goal this job serves. */
  goalId?: string | null;
}

/** Capture: the first line is the title, the rest the brief; a tag line is a flag, not a title. */
export function captureToJob(text: string): CreateJobInput {
  const isPrivate = briefIsPrivate(text);
  const lines = stripPrivateTag(text).split("\n");
  const title = (lines.shift() ?? "").trim().slice(0, 120) || "Untitled";
  return { title, brief: lines.join("\n").trim(), private: isPrivate };
}

export function createJob(input: CreateJobInput): Job {
  const title = input.title.trim().slice(0, 120);
  if (!title) throw new Error("A title is required.");
  const brief = (input.brief ?? "").trim().slice(0, 4000);
  const isPrivate = input.private === true || briefIsPrivate(brief) || briefIsPrivate(title);
  const now = new Date().toISOString();
  const job: Job = {
    id: crypto.randomUUID(),
    title: stripPrivateTag(title) || "Untitled",
    brief: stripPrivateTag(brief),
    lane: "inbox",
    runner: null,
    private: isPrivate,
    blockedReason: null,
    goalId: input.goalId ?? null,
    model: null,
    progress: 0,
    output: null,
    error: null,
    createdAt: now,
    startedAt: null,
    finishedAt: null,
    log: [{ at: now, line: isPrivate ? "Captured (private: local only)." : "Captured." }],
  };
  writeAll([job, ...readRaw()]);
  return job;
}

export function updateJob(id: string, patch: Partial<Job>): Job | null {
  const jobs = readRaw();
  const i = jobs.findIndex((j) => j.id === id);
  if (i < 0) return null;
  jobs[i] = { ...jobs[i], ...patch, id };
  writeAll(jobs);
  return jobs[i];
}

export function appendLog(id: string, line: string): void {
  const jobs = readRaw();
  const job = jobs.find((j) => j.id === id);
  if (!job) return;
  job.log = [...job.log, { at: new Date().toISOString(), line }].slice(-50);
  writeAll(jobs);
}

/** The private rule's outcome when no local server answers: parked with the reason, never run elsewhere. */
export function blockJob(id: string, reason: string): Job | null {
  const job = updateJob(id, { lane: "blocked", blockedReason: reason, progress: 0, error: null, startedAt: null, finishedAt: null });
  if (job) appendLog(id, `Blocked: ${reason}`);
  return job ? getJob(id) : null;
}

/** Back to the inbox, reason cleared. */
export function unblockJob(id: string): Job | null {
  const job = updateJob(id, { lane: "inbox", blockedReason: null, runner: null });
  if (job) appendLog(id, "Unblocked — back in the inbox.");
  return job ? getJob(id) : null;
}

export function deleteJob(id: string): boolean {
  runHandles().get(id)?.kill();
  const jobs = readRaw();
  const next = jobs.filter((j) => j.id !== id);
  if (next.length === jobs.length) return false;
  writeAll(next);
  return true;
}
