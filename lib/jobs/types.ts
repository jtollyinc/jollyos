/**
 * lib/jobs/types — the Jobs board's shapes and pure helpers.
 * Client-safe (no fs): the board UI imports from here, the store imports
 * from here, and nothing here touches the disk.
 */

export type JobLane = "inbox" | "running" | "done" | "failed";
export type RunnerId = "demo" | "provider";

export interface JobLogLine {
  at: string;
  line: string;
}

export interface Job {
  id: string;
  title: string;
  brief: string;
  lane: JobLane;
  runner: RunnerId | null;
  /** 0-100 */
  progress: number;
  output: string | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  /** Demo runner: how long the simulated run takes. */
  simulatedMs?: number;
  log: JobLogLine[];
}

export const LANES: { id: JobLane; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "running", label: "Running" },
  { id: "done", label: "Done" },
];

export function jobCounts(jobs: Job[]): Record<JobLane, number> {
  const by: Record<JobLane, number> = { inbox: 0, running: 0, done: 0, failed: 0 };
  for (const j of jobs) by[j.lane]++;
  return by;
}
