/**
 * Runner: api — the brief goes to your API provider (Anthropic first, else
 * OpenAI) through the SAME privacy router every module uses: cloud-ok persona
 * context is sent, local-only context is withheld (or routed to the local
 * server when one is configured). Prompt in, text out, awaited inside the
 * request. Shows "needs setup" until a key exists. Never runs a private job —
 * the registry routes those to Local before this file is reached.
 */
import { completeWithContext, ProviderError, providersFromEnv, type ProviderSet } from "@/lib/providers";
import { personaSegments, readEntries } from "@/lib/persona/store";
import type { Env } from "@/lib/config";
import { appendLog, runnerManifest, updateJob } from "../store";
import type { Runner } from "./runner";

const INSTRUCTIONS =
  "You are working a card from the owner's jobs board. Do the task described, concretely. " +
  "If it cannot be done from text alone, produce the best next artifact (a plan, a draft, a checklist). " +
  "Keep the owner's context below in mind.";

/** The provider set with a CLOUD default: the api runner is explicitly the cloud choice. */
function cloudSet(env: Env): ProviderSet | null {
  const set = providersFromEnv(env);
  const cloud = set.default.kind === "cloud" ? set.default : null;
  if (cloud) return set;
  // LLM_PROVIDER may point at local/demo; the api runner still wants the key-backed provider.
  const alt = providersFromEnv({ ...env, LLM_PROVIDER: env.ANTHROPIC_API_KEY ? "anthropic" : env.OPENAI_API_KEY ? "openai" : "" });
  return alt.default.kind === "cloud" ? alt : null;
}

export const apiRunner: Runner = {
  manifest: runnerManifest("api")!,
  async health(env = process.env) {
    const set = cloudSet(env);
    return set
      ? { ok: true, status: "ready", detail: `${set.default.label} · ${set.default.model}`, model: set.default.model }
      : { ok: false, status: "needs-setup", detail: "Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env.", model: null };
  },
  async start(job, env = process.env) {
    const set = cloudSet(env);
    if (!set) return updateJob(job.id, { lane: "failed", error: "The API runner needs a key (ANTHROPIC_API_KEY or OPENAI_API_KEY)." }) ?? job;
    if (job.private) return updateJob(job.id, { lane: "failed", error: "A private job may not use a cloud runner." }) ?? job;
    const startedAt = new Date().toISOString();
    updateJob(job.id, { lane: "running", runner: "api", progress: 10, error: null, blockedReason: null, startedAt, finishedAt: null });
    appendLog(job.id, `Sending the brief to ${set.default.label}…`);
    try {
      const result = await completeWithContext({
        instructions: INSTRUCTIONS,
        segments: personaSegments(readEntries()),
        prompt: `${job.title}\n\n${job.brief}`.trim(),
        kind: "job",
        maxTokens: 4000,
      }, set);
      appendLog(job.id, `Answered by ${result.route.provider.label} (${result.model}). ${result.route.reason}`);
      return updateJob(job.id, { lane: "done", progress: 100, output: result.text, model: result.model, finishedAt: new Date().toISOString() }) ?? job;
    } catch (err) {
      const message = err instanceof ProviderError ? err.message : err instanceof Error ? err.message : String(err);
      appendLog(job.id, `Failed: ${message}`);
      return updateJob(job.id, { lane: "failed", progress: 0, error: message, finishedAt: new Date().toISOString() }) ?? job;
    }
  },
};
