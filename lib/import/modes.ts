/**
 * lib/import/modes — the three extraction modes and the gate in front of them.
 * SERVER-SIDE ONLY (talks to providers).
 * ────────────────────────────────────────────────────────────────────────────
 *   rules  deterministic heuristics (lib/import/extract). Always available.
 *   local  your own model: the mined text is tagged local-only and goes
 *          through the normal router, which can only land it on the local
 *          provider. No local provider → refused (409) with the options.
 *   cloud  the default (hosted) provider, ONLY with an explicit per-batch
 *          opt-in. Without `cloudOptIn: true` the request is refused (403)
 *          before anything is built, let alone sent.
 *
 * `authorizeExtraction` is pure so the gate is unit-tested; the API route
 * calls it first and returns its status code verbatim. The UI shows the same
 * options, but the route is the enforcement.
 */
import { completeWithContext, type ContextSegment, type Provider, type ProviderSet } from "@/lib/providers";
import { extractCandidates } from "./extract";
import { type ExtractedItem, type ExtractionMode, isCategory, type MinedText } from "./types";

export type Authorization =
  | { ok: true; mode: ExtractionMode; provider: Provider | null; note: string }
  | { ok: false; status: 403 | 409; error: string; options: ExtractionMode[] };

export function authorizeExtraction(mode: ExtractionMode, cloudOptIn: boolean, providers: ProviderSet): Authorization {
  if (mode === "rules") return { ok: true, mode, provider: null, note: "Rule-based extraction; nothing was sent to a model." };
  if (mode === "local") {
    if (!providers.local) {
      return { ok: false, status: 409, error: "No local model is configured (set LOCAL_LLM_BASE_URL). Use rule-based extraction, or opt in to the cloud provider for this batch.", options: ["rules", "cloud"] };
    }
    return { ok: true, mode, provider: providers.local, note: `Extracted by ${providers.local.label} on this machine; nothing left it.` };
  }
  // cloud
  if (!cloudOptIn) {
    return { ok: false, status: 403, error: `Cloud extraction needs an explicit opt-in for this batch: it would send your imported text to ${providers.default.label}.`, options: ["rules", ...(providers.local ? ["local" as const] : [])] };
  }
  if (providers.default.kind === "local") {
    return { ok: true, mode, provider: providers.default, note: `Your default provider is the local model (${providers.default.label}); nothing left this machine.` };
  }
  return { ok: true, mode, provider: providers.default, note: `Sent to ${providers.default.label} (${providers.default.model}) with your opt-in for this batch.` };
}

const INSTRUCTIONS = [
  "You extract durable, reusable facts about the AUTHOR of the messages below: preferences, rules they follow, facts about their life and work, values, recurring decision patterns, interests, and topics they want to avoid.",
  "Ignore one-off requests, questions, and anything about the assistant. Rewrite each item in the first person as one short sentence.",
  "Output ONLY lines of JSON, one object per line, no prose:",
  '{"category":"preference|rule|fact|value|decision-pattern|interest|avoid","text":"...","confidence":0.0-1.0,"ref":"<copy the [ref] of the message it came from>"}',
].join("\n");

const CHUNK_CHARS = 6000;
const MAX_CHUNKS = 12;

function chunks(mined: MinedText[]): { text: string; refs: string[] }[] {
  const out: { text: string; refs: string[] }[] = [];
  let cur = { text: "", refs: [] as string[] };
  for (const m of mined) {
    const line = `[${m.ref}] ${m.text.replace(/\s+/g, " ").trim()}\n`;
    if (cur.text && cur.text.length + line.length > CHUNK_CHARS) { out.push(cur); cur = { text: "", refs: [] }; }
    cur.text += line;
    cur.refs.push(m.ref);
  }
  if (cur.text) out.push(cur);
  return out;
}

/** Parse "one JSON object per line" leniently (code fences, trailing commas, prose lines are ignored). */
export function parseModelLines(text: string, fallbackRef: string): ExtractedItem[] {
  const items: ExtractedItem[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim().replace(/^```(?:json)?|```$/g, "").replace(/,$/, "");
    if (!line.startsWith("{")) continue;
    try {
      const o = JSON.parse(line) as Record<string, unknown>;
      if (!isCategory(o.category) || typeof o.text !== "string" || !o.text.trim()) continue;
      const conf = typeof o.confidence === "number" ? Math.min(0.99, Math.max(0.05, o.confidence)) : 0.6;
      items.push({ category: o.category, text: o.text.trim().slice(0, 500), ref: typeof o.ref === "string" && o.ref.trim() ? o.ref.trim() : fallbackRef, confidence: Math.round(conf * 100) / 100 });
    } catch {
      // not JSON — a model aside; skip
    }
  }
  return items;
}

export interface ModelExtraction {
  items: ExtractedItem[];
  fromModel: number;
  fromRules: number;
  truncated: boolean;
  note: string;
}

/**
 * Run the model over the mined text, then union with the rule-based items (the
 * review queue is the filter). The privacy tag on every segment is the mode's:
 * local → local-only (so only the local provider can receive it), cloud →
 * cloud-ok (the owner's per-batch opt-in). Both still go through the router.
 */
export async function extractWithModel(mined: MinedText[], mode: "local" | "cloud", providers: ProviderSet): Promise<ModelExtraction> {
  const privacy = mode === "local" ? "local-only" : "cloud-ok";
  const parts = chunks(mined);
  const truncated = parts.length > MAX_CHUNKS;
  const items: ExtractedItem[] = [];
  let failures = 0;
  for (const part of parts.slice(0, MAX_CHUNKS)) {
    const segments: ContextSegment[] = [{ title: "the author's own messages", text: part.text, privacy }];
    try {
      const r = await completeWithContext({ instructions: INSTRUCTIONS, segments, prompt: "Extract the items now. JSON lines only.", kind: "generic", maxTokens: 1500 }, providers);
      if (r.route.dropped.length) throw new Error("The router withheld the text (no local provider); nothing was sent.");
      items.push(...parseModelLines(r.text, part.refs[0] ?? "import"));
    } catch {
      failures++;
    }
  }
  const fromModel = items.length;
  const rules = extractCandidates(mined).items;
  const seen = new Set(items.map((i) => i.text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()));
  let fromRules = 0;
  for (const r of rules) {
    const key = r.text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(r);
    fromRules++;
  }
  const bits = [`${fromModel} from the model`, `${fromRules} from rules`];
  if (failures) bits.push(`${failures} chunk${failures === 1 ? "" : "s"} failed`);
  if (truncated) bits.push(`only the first ${MAX_CHUNKS} chunks were sent`);
  if (fromModel === 0 && !failures) bits.push("the model returned nothing usable, so the rules filled in");
  return { items: items.sort((a, b) => b.confidence - a.confidence), fromModel, fromRules, truncated, note: bits.join(" · ") };
}
