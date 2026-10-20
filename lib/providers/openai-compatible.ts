/**
 * lib/providers/openai-compatible — one HTTP client for every server that
 * speaks the OpenAI chat-completions shape: OpenAI itself, LM Studio, Ollama,
 * llama.cpp, vLLM. Both the `openai` and `local` providers are thin wrappers
 * around this file so the request/response handling lives once.
 */
import type { CompletionRequest, CompletionResult, ProviderId } from "./types";
import { ProviderError } from "./types";

export interface CompatibleOptions {
  id: ProviderId;
  baseUrl: string;
  apiKey?: string;
  /** Empty string = let the server pick (LM Studio does this). */
  model: string;
  timeoutMs?: number;
}

interface ChatResponse {
  model?: string;
  choices?: { message?: { content?: string | null } }[];
  error?: { message?: string } | string;
}

export async function chatComplete(opts: CompatibleOptions, req: CompletionRequest): Promise<CompletionResult> {
  const messages: { role: "system" | "user"; content: string }[] = [];
  if (req.system) messages.push({ role: "system", content: req.system });
  messages.push({ role: "user", content: req.prompt });

  const body: Record<string, unknown> = { messages, max_tokens: req.maxTokens ?? 2048 };
  if (opts.model) body.model = opts.model;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;

  let res: Response;
  try {
    res = await fetch(`${opts.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
    });
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    throw new ProviderError(`Could not reach ${opts.id} at ${opts.baseUrl}: ${why}`, opts.id);
  }

  const json = (await res.json().catch(() => null)) as ChatResponse | null;
  if (!res.ok || !json) {
    const detail = typeof json?.error === "string" ? json.error : json?.error?.message;
    throw new ProviderError(`${opts.id} returned HTTP ${res.status}${detail ? `: ${detail}` : ""}`, opts.id);
  }
  const text = json.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new ProviderError(`${opts.id} returned an empty answer.`, opts.id);
  return { text, provider: opts.id, model: json.model || opts.model || "unknown" };
}
