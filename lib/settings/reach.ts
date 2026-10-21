/**
 * lib/settings/reach — "Test" on the AI brain screen: does this thing answer?
 * SERVER-SIDE ONLY (outbound fetch).
 * ────────────────────────────────────────────────────────────────────────────
 * A real request, from the server that would actually use the model, to the
 * cheapest endpoint each one offers (a model list — free on every vendor and on
 * every local server). The result is one plain sentence: no stack traces, no
 * HTTP jargon where a human word exists, and never the key.
 *
 * Local servers disagree about where /models lives (LM Studio serves
 * http://host:1234/v1/models, Ollama serves /v1/models AND /api/tags), so every
 * plausible path is tried and the first one that answers wins.
 */

export interface ReachResult {
  ok: boolean;
  /** One sentence for the owner. Safe to render verbatim. */
  message: string;
  /** The URL or vendor that answered, for the receipt. */
  endpoint?: string;
  /** Model ids the server reported, at most a few. */
  models?: string[];
}

const TIMEOUT_MS = 8_000;

function candidates(baseUrl: string): string[] {
  const base = baseUrl.replace(/\/+$/, "");
  const out = [`${base}/models`];
  if (!/\/v1$/i.test(base)) out.push(`${base}/v1/models`);
  out.push(`${base}/api/tags`);
  return out;
}

/** Model ids out of an OpenAI-style {data:[{id}]} or an Ollama {models:[{name}]}. */
function modelIds(body: unknown): string[] {
  const rows = (body as { data?: unknown; models?: unknown })?.data ?? (body as { models?: unknown })?.models;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => (r as { id?: unknown; name?: unknown })?.id ?? (r as { name?: unknown })?.name)
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .slice(0, 5);
}

const why = (err: unknown): string => {
  const msg = err instanceof Error ? err.message : String(err);
  if (/abort|timeout|timed out/i.test(msg)) return "it did not answer in time";
  if (/ECONNREFUSED|refused/i.test(msg)) return "nothing is listening there";
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(msg)) return "that address does not resolve";
  if (/certificate|SSL|TLS/i.test(msg)) return "its certificate was rejected";
  return "the connection failed";
};

async function getJson(url: string, headers: Record<string, string>): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  const text = await res.text();
  let body: unknown = null;
  try { body = JSON.parse(text); } catch { body = null; }
  return { status: res.status, body };
}

/** A model on this machine (LM Studio, Ollama, llama.cpp, vLLM). */
export async function testLocalModel(baseUrl: string): Promise<ReachResult> {
  const base = baseUrl.trim();
  if (!/^https?:\/\//i.test(base)) {
    return { ok: false, message: "That does not look like a URL. It should start with http:// — LM Studio is usually http://localhost:1234/v1, Ollama http://localhost:11434/v1." };
  }
  let lastWhy = "the connection failed";
  for (const url of candidates(base)) {
    try {
      const { status, body } = await getJson(url, { Accept: "application/json" });
      if (status === 200) {
        const models = modelIds(body);
        return {
          ok: true,
          endpoint: url,
          models,
          message: models.length
            ? `Reached it. ${models.length} model${models.length === 1 ? "" : "s"} available${models[0] ? `, starting with ${models[0]}` : ""}.`
            : "Reached it, but it listed no models — load one in your model server, then test again.",
        };
      }
      if (status === 401 || status === 403) return { ok: false, endpoint: url, message: "It answered, but refused the request — that server wants an API key." };
      lastWhy = `it answered ${status}`;
    } catch (err) {
      lastWhy = why(err);
    }
  }
  return { ok: false, message: `Could not reach ${base} — ${lastWhy}. Start your model server, then test again.` };
}

/** A hosted key. Lists models, which every vendor allows for free. */
export async function testApiKey(vendor: "anthropic" | "openai", apiKey: string): Promise<ReachResult> {
  const key = apiKey.trim();
  if (!key) return { ok: false, message: "Paste a key first." };
  const url = vendor === "anthropic" ? "https://api.anthropic.com/v1/models" : "https://api.openai.com/v1/models";
  const headers: Record<string, string> = vendor === "anthropic"
    ? { Accept: "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" }
    : { Accept: "application/json", Authorization: `Bearer ${key}` };
  const label = vendor === "anthropic" ? "Anthropic" : "OpenAI";
  try {
    const { status, body } = await getJson(url, headers);
    if (status === 200) {
      const models = modelIds(body);
      return { ok: true, endpoint: label, models, message: `${label} accepted the key. ${models.length} model${models.length === 1 ? "" : "s"} available.` };
    }
    if (status === 401 || status === 403) return { ok: false, endpoint: label, message: `${label} rejected that key. Check you pasted the whole thing, with no spaces.` };
    if (status === 429) return { ok: false, endpoint: label, message: `${label} says the key is rate-limited or out of credit right now.` };
    return { ok: false, endpoint: label, message: `${label} answered ${status}. The key may be fine; try again in a moment.` };
  } catch (err) {
    return { ok: false, endpoint: label, message: `Could not reach ${label} — ${why(err)}. Check this machine is online.` };
  }
}
