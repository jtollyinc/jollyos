/**
 * lib/jobs/runners — the registry, and the ONE rule that picks a runner.
 * ────────────────────────────────────────────────────────────────────────────
 * Adding a runner = one file beside this one plus one manifest entry in
 * ../types.ts (docs/runners.md). Runners reuse lib/providers for the model;
 * none of them shells out except the CLI one, and none touches another host.
 * SERVER-SIDE ONLY.
 */
import { defaultRunner, type Env } from "@/lib/config";
import { blockJob, getJob, type Job, RUNNER_MANIFESTS, resolveRunner, validateRegistry, type RunnerChoice, type RunnerId } from "../store";
import { apiRunner } from "./api";
import { cliRunner } from "./cli";
import { demoRunner } from "./demo";
import { LOCAL_UNREACHABLE, localRunner } from "./local";
import type { Runner, RunnerHealth } from "./runner";

export type { Runner, RunnerHealth } from "./runner";
export { LOCAL_UNREACHABLE, probeLocal, resetLocalProbe } from "./local";
export { detectCli } from "./cli";

export const RUNNERS: readonly Runner[] = [apiRunner, cliRunner, localRunner, demoRunner];

const problems = [
  ...validateRegistry(RUNNER_MANIFESTS),
  ...RUNNER_MANIFESTS.filter((m) => !RUNNERS.some((r) => r.manifest.id === m.id)).map((m) => `${m.id}: manifest without a runner file`),
  ...RUNNERS.filter((r) => !RUNNER_MANIFESTS.some((m) => m.id === r.manifest.id)).map((r) => `${r.manifest.id}: runner file without a manifest`),
];
if (problems.length) throw new Error(`lib/jobs/runners registry is inconsistent: ${problems.join("; ")}`);

export function getRunner(id: RunnerId): Runner {
  return RUNNERS.find((r) => r.manifest.id === id) ?? demoRunner;
}

export type RunnerStatus = { id: RunnerId } & RunnerHealth;

/** Health of every runner, in parallel, never rejecting. */
export async function runnerStatuses(env: Env = process.env): Promise<RunnerStatus[]> {
  return Promise.all(RUNNERS.map(async (r) => {
    try { return { id: r.manifest.id, ...(await r.health(env)) }; }
    catch (e) { return { id: r.manifest.id, ok: false, status: "unreachable" as const, detail: (e as Error).message, model: null }; }
  }));
}

export type RunOutcome = { job: Job; resolution: ReturnType<typeof resolveRunner> } | { error: string; status: number };

/**
 * Validate, resolve (Auto → default; private → Local, never cloud), gate on
 * health (Local down → Blocked; api/cli not set up → 409), then start.
 */
export async function runJob(id: string, choice: RunnerChoice | string | null | undefined, env: Env = process.env): Promise<RunOutcome> {
  const job = getJob(id);
  if (!job) return { error: "No such job.", status: 404 };
  if (choice != null && choice !== "" && !["auto", ...RUNNER_MANIFESTS.map((m) => m.id)].includes(String(choice))) return { error: `Unknown runner "${choice}".`, status: 400 };
  if (job.lane === "running") return { error: "That job is already running.", status: 409 };
  const resolution = resolveRunner((choice || "auto") as RunnerChoice, { private: job.private, defaultRunner: defaultRunner(env) });
  const runner = getRunner(resolution.runner);
  const health = await runner.health(env);
  if (!health.ok) {
    if (resolution.runner === "local") {
      // The private rule's hard stop: parked with the reason, never run anywhere else.
      return { job: blockJob(job.id, `${LOCAL_UNREACHABLE} (${health.detail})`) ?? job, resolution };
    }
    return { error: `${runner.manifest.label} runner needs setup: ${health.detail}`, status: 409 };
  }
  return { job: await runner.start(job, env), resolution };
}
