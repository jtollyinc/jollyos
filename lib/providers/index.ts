/**
 * lib/providers — build the ProviderSet from the environment and run a
 * privacy-routed completion.
 * ────────────────────────────────────────────────────────────────────────────
 * Resolution order for the DEFAULT provider:
 *   LLM_PROVIDER if set (anthropic | openai | local | demo) and configured;
 *   else the first of anthropic → openai → local that has its key/url;
 *   else the deterministic demo provider.
 * The LOCAL slot is filled whenever LOCAL_LLM_BASE_URL is set, regardless of
 * what the default is, because the router needs it for local-only content.
 *
 * Modules call `completeWithContext` and never pick a provider themselves.
 */
import type { Env } from "@/lib/config";
import { anthropicProvider } from "./anthropic";
import { demoProvider } from "./demo";
import { localProvider } from "./local";
import { openaiProvider } from "./openai";
import { renderSegments, routeSegments, type ProviderSet, type RouteDecision } from "./routing";
import type { CompletionKind, CompletionResult, ContextSegment, Provider, ProviderId } from "./types";

export type { Provider, ProviderId, ContextSegment, Privacy, CompletionResult } from "./types";
export { ProviderError } from "./types";
export type { ProviderSet, RouteDecision } from "./routing";
export { routeSegments, renderSegments } from "./routing";

const PROVIDER_IDS: ProviderId[] = ["anthropic", "openai", "local", "demo"];

/** Build every provider the environment has credentials for. */
export function providersFromEnv(env: Env = process.env): ProviderSet {
  const warnings: string[] = [];
  const available = new Map<ProviderId, Provider>();

  if (env.ANTHROPIC_API_KEY) available.set("anthropic", anthropicProvider({ apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL }));
  if (env.OPENAI_API_KEY) available.set("openai", openaiProvider({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL }));
  if (env.LOCAL_LLM_BASE_URL) available.set("local", localProvider({ baseUrl: env.LOCAL_LLM_BASE_URL, model: env.LOCAL_LLM_MODEL }));
  available.set("demo", demoProvider());

  const requested = (env.LLM_PROVIDER ?? "").trim().toLowerCase();
  let chosen: Provider | undefined;
  if (requested) {
    if (!PROVIDER_IDS.includes(requested as ProviderId)) {
      warnings.push(`LLM_PROVIDER="${requested}" is not one of ${PROVIDER_IDS.join(", ")}; using auto-detection.`);
    } else {
      chosen = available.get(requested as ProviderId);
      if (!chosen) warnings.push(`LLM_PROVIDER=${requested} but it is not configured; falling back.`);
    }
  }
  if (!chosen) {
    chosen = available.get("anthropic") ?? available.get("openai") ?? available.get("local") ?? available.get("demo")!;
  }
  if (chosen.id === "demo" && !requested) {
    warnings.push("No provider key found; answers come from the deterministic demo provider.");
  }

  return { default: chosen, local: available.get("local") ?? null, warnings };
}

export interface ContextCompletion extends CompletionResult {
  route: RouteDecision;
}

export interface ContextCompletionInput {
  /** Instructions that are always safe to send (no user data). */
  instructions: string;
  /** Tagged context; the router decides what is sent where. */
  segments: ContextSegment[];
  prompt: string;
  kind?: CompletionKind;
  maxTokens?: number;
}

/** The only way modules should talk to a model. */
export async function completeWithContext(
  input: ContextCompletionInput,
  providers: ProviderSet = providersFromEnv(),
): Promise<ContextCompletion> {
  const route = routeSegments(input.segments, providers);
  const context = renderSegments(route.segments);
  const system = context ? `${input.instructions.trim()}\n\n${context}` : input.instructions.trim();
  const result = await route.provider.complete({
    system,
    prompt: input.prompt,
    kind: input.kind,
    maxTokens: input.maxTokens,
  });
  return { ...result, route };
}
