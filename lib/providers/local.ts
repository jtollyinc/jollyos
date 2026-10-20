/**
 * lib/providers/local — an OpenAI-compatible server you run yourself
 * (LM Studio, Ollama, llama.cpp, vLLM). Configured by LOCAL_LLM_BASE_URL
 * (e.g. http://localhost:1234/v1) and optionally LOCAL_LLM_MODEL.
 *
 * This is the only provider with kind "local", which makes it the only
 * provider the router will ever hand `local-only` content to.
 */
import { chatComplete } from "./openai-compatible";
import type { Provider } from "./types";

export function localProvider(opts: { baseUrl: string; model?: string }): Provider {
  const model = opts.model ?? "";
  return {
    id: "local",
    label: "Local model",
    kind: "local",
    model: model || "(server default)",
    complete: (req) => chatComplete({ id: "local", baseUrl: opts.baseUrl, model, timeoutMs: 180_000 }, req),
  };
}
