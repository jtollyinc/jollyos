/**
 * lib/jobs/store — the Jobs board's cards. SERVER-SIDE ONLY (fs).
 * ────────────────────────────────────────────────────────────────────────────
 * A job is a card with a lane (inbox → running → done | failed), an optional
 * runner, a progress figure and an output. Capture creates one in the inbox;
 * a runner moves it along (lib/jobs/runners.ts). Storage: DATA_DIR/jobs.json.
 *
 * `settle` is applied on every read so time-based runners (the demo one)
 * advance without any background process: progress is a function of elapsed
 * time, computed when somebody looks.
 */
import crypto from "node:crypto";
import { dataPath, readJson, writeJson } from "@/lib/data-dir";

import type { Job } from "./types";

export * from "./types";

interface JobsFile {
  jobs: Job[];
}

const file = () => dataPath("jobs.json");

function readRaw(): Job[] {
  return readJson<JobsFile>(file(), { jobs: [] }).jobs;
}

function writeAll(jobs: Job[]): void {
  writeJson(file(), { jobs });
}

/** Lanes derived from elapsed time for the demo runner. Pure. */
export function settle(job: Job, now = Date.now()): Job {
  if (job.lane !== "running" || job.runner !== "demo" || !job.startedAt) return job;
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

function demoOutput(job: Job): string {
  return [
    `Simulated run for: ${job.title}`,
    "",
    "- Broke the brief into three steps",
    "- Did the first one",
    "- Left the next step as a note on this card",
    "",
    "_(Demo runner: no model was called. Pick the provider runner to use a real one.)_",
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
}

/** Capture: the first line is the title, the rest the brief. */
export function captureToJob(text: string): CreateJobInput {
  const lines = text.trim().split("\n");
  const title = (lines.shift() ?? "").trim().slice(0, 120) || "Untitled";
  return { title, brief: lines.join("\n").trim() };
}

export function createJob(input: CreateJobInput): Job {
  const title = input.title.trim().slice(0, 120);
  if (!title) throw new Error("A title is required.");
  const now = new Date().toISOString();
  const job: Job = {
    id: crypto.randomUUID(),
    title,
    brief: (input.brief ?? "").trim().slice(0, 4000),
    lane: "inbox",
    runner: null,
    progress: 0,
    output: null,
    error: null,
    createdAt: now,
    startedAt: null,
    finishedAt: null,
    log: [{ at: now, line: "Captured." }],
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

export function deleteJob(id: string): boolean {
  const jobs = readRaw();
  const next = jobs.filter((j) => j.id !== id);
  if (next.length === jobs.length) return false;
  writeAll(next);
  return true;
}
