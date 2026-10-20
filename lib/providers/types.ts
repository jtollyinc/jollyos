/**
 * lib/providers/types — the one interface every model provider implements.
 * ────────────────────────────────────────────────────────────────────────────
 * A Provider turns a prompt into text. That is deliberately all it does: the
 * modules never see an SDK, a model name or an HTTP client, so swapping
 * Anthropic for a local LM Studio server is a config change, not a code change.
 *
 * `kind` is what the privacy router keys on:
 *   cloud  — a model somebody else hosts (Anthropic, OpenAI)
 *   local  — an OpenAI-compatible server on hardware you control
 *   demo   — deterministic, in-process, no network at all
 * Content tagged `local-only` is only ever sent to a `local` provider.
 */

export type Privacy = "public" | "cloud-ok" | "local-only";

export type ProviderId = "anthropic" | "openai" | "local" | "demo";
export type ProviderKind = "cloud" | "local" | "demo";

/** Lets the demo provider shape a plausible answer per feature. */
export type CompletionKind = "ask" | "brief" | "job" | "generic";

export interface CompletionRequest {
  /** System instructions (persona context, format rules). */
  system?: string;
  /** The user turn. */
  prompt: string;
  maxTokens?: number;
  kind?: CompletionKind;
}

export interface CompletionResult {
  text: string;
  provider: ProviderId;
  model: string;
}

export interface Provider {
  id: ProviderId;
  label: string;
  kind: ProviderKind;
  model: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
  /** Optional token stream; callers fall back to complete() when absent. */
  stream?(req: CompletionRequest): AsyncIterable<string>;
}

/** A block of context with a privacy tag, e.g. one persona entry. */
export interface ContextSegment {
  title: string;
  text: string;
  privacy: Privacy;
}

/** Thrown by providers for anything the UI should show as one honest line. */
export class ProviderError extends Error {
  constructor(message: string, public readonly provider: ProviderId) {
    super(message);
    this.name = "ProviderError";
  }
}
