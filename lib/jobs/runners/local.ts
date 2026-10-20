/**
 * Runner: local — the LOCAL runner and the only one a private job may use.
 * Prompt → result on your OpenAI-compatible server (LOCAL_LLM_BASE_URL — the
 * same `localProvider` the privacy router hands local-only content to). The
 * persona context goes in whole, local-only entries included: it never leaves
 * your machine. Unreachable → the job is BLOCKED with the reason, never sent
 * to a cloud model. The health probe is one GET /models, cached 60 s when
 * down so a sleeping box costs one timeout a minute, not one per read.
 */
import { localProvider } from "@/lib/providers/local";
import { ProviderError } from "@/lib/providers/types";
import { renderSegments } from "@/lib/providers/routing";
import { personaSegments, readEntries } from "@/lib/persona/store";
import type { Env } from "@/lib/config";
import { appendLog, blockJob, runnerManifest, updateJob } from "../store";
import type { Runner, RunnerHealth } from "./runner";

export const LOCAL_UNREACHABLE = "Local model is unreachable — job kept local, not sent to a cloud model";
const INSTRUCTIONS =
  "You are working a card from the owner's jobs board on their own machine. Do the task described, concretely, in plain text. " +
  "If it cannot be done from text alone, say what the next concrete step is. Keep the owner's context below in mind.";

interface ProbeDeps { fetchImpl?: typeof fetch; now?: () => number }
const cache = new Map<string, { at: number; health: RunnerHealth }>();
const OK_TTL = 10_000, DOWN_TTL = 60_000;

/** Reachability of the configured server. Exported so a test can drive it with a fake fetch and clock. */
export async function probeLocal(env: Env = process.env, deps: ProbeDeps = {}): Promise<RunnerHealth> {
  const baseUrl = (env.LOCAL_LLM_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (!baseUrl) return { ok: false, status: "needs-setup", detail: "Set LOCAL_LLM_BASE_URL to your OpenAI-compatible server (e.g. http://localhost:1234/v1).", model: null };
  const now = deps.now ?? (() => Date.now());
  const hit = cache.get(baseUrl);
  if (hit && now() - hit.at < (hit.health.ok ? OK_TTL : DOWN_TTL)) return hit.health;
  const doFetch = deps.fetchImpl ?? fetch;
  let health: RunnerHealth;
  try {
    const res = await doFetch(`${baseUrl}/models`, { signal: AbortSignal.timeout(3_000), cache: "no-store" });
    if (!res.ok) health = { ok: false, status: "unreachable", detail: `${baseUrl} answered ${res.status}.`, model: null };
    else {
      const json = (await res.json().catch(() => ({}))) as { data?: { id?: string }[] };
      const ids = (json.data ?? []).map((m) => m?.id).filter((x): x is string => typeof x === "string");
      const model = (env.LOCAL_LLM_MODEL ?? "").trim() || ids[0] || null;
      health = { ok: true, status: "ready", detail: `Reachable at ${baseUrl}${ids.length ? ` · ${ids.length} model${ids.length === 1 ? "" : "s"}` : ""}.`, model };
    }
  } catch {
    health = { ok: false, status: "unreachable", detail: `No answer from ${baseUrl}. Is the server running?`, model: null };
  }
  cache.set(baseUrl, { at: now(), health });
  return health;
}
export const resetLocalProbe = (): void => cache.clear();

export const localRunner: Runner = {
  manifest: runnerManifest("local")!,
  health: (env = process.env) => probeLocal(env),
  async start(job, env = process.env) {
    const health = await probeLocal(env);
    if (!health.ok) return blockJob(job.id, LOCAL_UNREACHABLE) ?? job;
    const baseUrl = (env.LOCAL_LLM_BASE_URL ?? "").trim();
    const provider = localProvider({ baseUrl, model: (env.LOCAL_LLM_MODEL ?? "").trim() || undefined });
    const startedAt = new Date().toISOString();
    updateJob(job.id, { lane: "running", runner: "local", progress: 10, error: null, blockedReason: null, startedAt, finishedAt: null });
    appendLog(job.id, `Sending the brief to the local server${job.private ? " (private: local only)" : ""}…`);
    try {
      const context = renderSegments(personaSegments(readEntries()));   // everything, including local-only: it stays on this machine
      const result = await provider.complete({
        system: context ? `${INSTRUCTIONS}\n\n${context}` : INSTRUCTIONS,
        prompt: `${job.title}\n\n${job.brief}`.trim(),
        kind: "job",
        maxTokens: 2048,
      });
      appendLog(job.id, `Answered by the local server (${result.model}). $0.`);
      return updateJob(job.id, { lane: "done", progress: 100, output: result.text, model: result.model, finishedAt: new Date().toISOString() }) ?? job;
    } catch (err) {
      const message = err instanceof ProviderError ? err.message : err instanceof Error ? err.message : String(err);
      if (/Could not reach/i.test(message)) { resetLocalProbe(); return blockJob(job.id, LOCAL_UNREACHABLE) ?? job; }
      appendLog(job.id, `Failed: ${message}`);
      return updateJob(job.id, { lane: "failed", progress: 0, error: message, finishedAt: new Date().toISOString() }) ?? job;
    }
  },
};
