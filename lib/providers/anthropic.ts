/**
 * lib/providers/anthropic — Claude through the official @anthropic-ai/sdk.
 * Requires ANTHROPIC_API_KEY; ANTHROPIC_MODEL overrides the default model.
 * Errors are mapped to one-line ProviderErrors so the UI can show them as-is.
 */
import Anthropic from "@anthropic-ai/sdk";
import { ProviderError, type CompletionRequest, type CompletionResult, type Provider } from "./types";

export const ANTHROPIC_DEFAULT_MODEL = "claude-opus-5";

export function anthropicProvider(opts: { apiKey: string; model?: string }): Provider {
  const model = opts.model || ANTHROPIC_DEFAULT_MODEL;
  const client = new Anthropic({ apiKey: opts.apiKey });

  async function complete(req: CompletionRequest): Promise<CompletionResult> {
    try {
      const res = await client.messages.create({
        model,
        max_tokens: req.maxTokens ?? 16000,
        system: req.system,
        messages: [{ role: "user", content: req.prompt }],
      });
      if (res.stop_reason === "refusal") {
        throw new ProviderError("The model declined this request.", "anthropic");
      }
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (!text) throw new ProviderError("Anthropic returned an empty answer.", "anthropic");
      return { text, provider: "anthropic", model: res.model };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      if (err instanceof Anthropic.AuthenticationError) throw new ProviderError("Anthropic rejected the API key.", "anthropic");
      if (err instanceof Anthropic.RateLimitError) throw new ProviderError("Anthropic rate limit hit — try again shortly.", "anthropic");
      if (err instanceof Anthropic.APIError) throw new ProviderError(`Anthropic error ${err.status ?? ""}: ${err.message}`, "anthropic");
      throw new ProviderError(`Anthropic request failed: ${err instanceof Error ? err.message : String(err)}`, "anthropic");
    }
  }

  async function* stream(req: CompletionRequest): AsyncIterable<string> {
    const s = client.messages.stream({
      model,
      max_tokens: req.maxTokens ?? 16000,
      system: req.system,
      messages: [{ role: "user", content: req.prompt }],
    });
    for await (const event of s) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
    }
  }

  return { id: "anthropic", label: "Anthropic", kind: "cloud", model, complete, stream };
}
