/**
 * lib/jobs/runners — the pluggable "runner" behind the Jobs board.
 * ────────────────────────────────────────────────────────────────────────────
 * A runner takes a job in the inbox and moves it to done (or failed). Two ship:
 *
 *   demo      simulates progress over a few seconds — no model, no network.
 *             Progress is derived from elapsed time on read (lib/jobs/store.ts
 *             `settle`), so nothing runs in the background.
 *   provider  sends the brief to the configured model through the provider
 *             router, persona-aware, and stores the answer as the output.
 *
 * To add one: implement Runner, register it in RUNNERS. Runners never shell
 * out, never touch other hosts — keep that property if you add your own.
 * SERVER-SIDE ONLY.
 */
import { completeWithContext, ProviderError, providersFromEnv } from "@/lib/providers";
import { personaSegments, readEntries } from "@/lib/persona/store";
import { appendLog, getJob, updateJob, type Job, type RunnerId } from "./store";

export interface Runner {
  id: RunnerId;
  label: string;
  description: string;
  /** Start the job; resolves when the runner has done all it will do synchronously. */
  start(job: Job): Promise<Job>;
}

const demoRunner: Runner = {
  id: "demo",
  label: "Demo runner",
  description: "Simulates a short run. No model, no network.",
  async start(job) {
    const now = new Date().toISOString();
    const next = updateJob(job.id, {
      lane: "running", runner: "demo", progress: 0, error: null, startedAt: now, finishedAt: null,
      simulatedMs: 6000 + (job.title.length % 5) * 800,
      log: [...job.log, { at: now, line: "Demo runner started." }],
    });
    return next ?? job;
  },
};

const providerRunner: Runner = {
  id: "provider",
  label: "Model runner",
  description: "Sends the brief to the configured model (persona-aware, privacy-routed).",
  async start(job) {
    const startedAt = new Date().toISOString();
    updateJob(job.id, { lane: "running", runner: "provider", progress: 10, error: null, startedAt, finishedAt: null });
    appendLog(job.id, "Sending the brief to the model…");
    try {
      const result = await completeWithContext({
        instructions:
          "You are working a card from the owner's jobs board. Do the task described, concretely. " +
          "If it cannot be done from text alone, produce the best next artifact (a plan, a draft, a checklist). " +
          "Keep the owner's context below in mind.",
        segments: personaSegments(readEntries()),
        prompt: `${job.title}\n\n${job.brief}`.trim(),
        kind: "job",
        maxTokens: 4000,
      }, providersFromEnv());
      appendLog(job.id, `Answered by ${result.route.provider.label} (${result.model}). ${result.route.reason}`);
      const done = updateJob(job.id, { lane: "done", progress: 100, output: result.text, finishedAt: new Date().toISOString() });
      return done ?? job;
    } catch (err) {
      const message = err instanceof ProviderError ? err.message : err instanceof Error ? err.message : String(err);
      appendLog(job.id, `Failed: ${message}`);
      const failed = updateJob(job.id, { lane: "failed", progress: 0, error: message, finishedAt: new Date().toISOString() });
      return failed ?? job;
    }
  },
};

export const RUNNERS: Runner[] = [demoRunner, providerRunner];

export function getRunner(id: string): Runner | null {
  return RUNNERS.find((r) => r.id === id) ?? null;
}

/** Validate and start. Returns the updated job or a reason it could not start. */
export async function runJob(id: string, runnerId: string): Promise<{ job: Job } | { error: string; status: number }> {
  const job = getJob(id);
  if (!job) return { error: "No such job.", status: 404 };
  const runner = getRunner(runnerId);
  if (!runner) return { error: `Unknown runner "${runnerId}".`, status: 400 };
  if (job.lane === "running") return { error: "That job is already running.", status: 409 };
  return { job: await runner.start(job) };
}
