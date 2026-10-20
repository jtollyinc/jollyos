/**
 * lib/providers/openai — OpenAI through the chat-completions endpoint.
 * Requires OPENAI_API_KEY; OPENAI_MODEL overrides the default model.
 */
import { chatComplete } from "./openai-compatible";
import type { Provider } from "./types";

export const OPENAI_DEFAULT_MODEL = "gpt-5-mini";

export function openaiProvider(opts: { apiKey: string; model?: string }): Provider {
  const model = opts.model || OPENAI_DEFAULT_MODEL;
  return {
    id: "openai",
    label: "OpenAI",
    kind: "cloud",
    model,
    complete: (req) =>
      chatComplete({ id: "openai", baseUrl: "https://api.openai.com/v1", apiKey: opts.apiKey, model }, req),
  };
}
