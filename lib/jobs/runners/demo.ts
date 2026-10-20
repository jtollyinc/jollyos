/**
 * Runner: demo — simulates a short run. No model, no network. Progress is a
 * function of elapsed time computed on read (lib/jobs/store `settle`), so
 * nothing runs in the background and a restart loses nothing.
 */
import { runnerManifest, updateJob } from "../store";
import type { Runner } from "./runner";

export const demoRunner: Runner = {
  manifest: runnerManifest("demo")!,
  async health() { return { ok: true, status: "ready", detail: "Always available — deterministic, no model.", model: "deterministic" }; },
  async start(job) {
    const now = new Date().toISOString();
    const next = updateJob(job.id, {
      lane: "running", runner: "demo", progress: 0, error: null, blockedReason: null, startedAt: now, finishedAt: null, model: "deterministic",
      simulatedMs: 6000 + (job.title.length % 5) * 800,
      log: [...job.log, { at: now, line: "Demo runner started." }],
    });
    return next ?? job;
  },
};
