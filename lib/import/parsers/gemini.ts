/**
 * lib/import/parsers/gemini — mine Google Takeout "My Activity" JSON for Gemini.
 * ────────────────────────────────────────────────────────────────────────────
 * ASSUMED shape (the My Activity JSON format is not formally documented):
 *   [ { header: "Gemini Apps", title: "Prompted <what you typed>", time: "<ISO>",
 *       products: ["Gemini Apps"], ... } ]
 * Only rows whose title starts with "Prompted" are the owner's own words;
 * everything else (responses, "Used Gemini Apps", ...) is skipped. Unknown
 * fields are ignored. If your export looks different, the paste box works
 * on any text.
 */
import type { MinedText, ParseResult } from "../types";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const PROMPTED = /^prompted\s+/i;

export function parseGeminiActivity(json: unknown): ParseResult {
  const items: MinedText[] = [];
  const warnings: string[] = [];
  const stats = { conversations: 0, messages: 0, files: 1, skipped: 0 };
  const list: unknown[] = Array.isArray(json) ? json : [];
  if (!list.length) {
    warnings.push("No activity rows found. Expected the MyActivity.json for Gemini Apps from Google Takeout (an array of rows with a `title`).");
    return { items, warnings, stats };
  }
  let n = 0;
  for (const row of list) {
    if (!isRecord(row) || typeof row.title !== "string") { stats.skipped++; continue; }
    n++;
    if (!PROMPTED.test(row.title)) continue;
    const text = row.title.replace(PROMPTED, "").trim();
    if (!text) continue;
    stats.messages++;
    items.push({ text, ref: `Gemini activity › row ${n}`, kind: "message", at: typeof row.time === "string" ? row.time : null });
  }
  stats.conversations = stats.messages ? 1 : 0;
  if (!items.length) warnings.push("The file parsed, but no rows started with \"Prompted\" — nothing the owner typed was found.");
  return { items, warnings, stats };
}

export function looksLikeGeminiActivity(json: unknown): boolean {
  return Array.isArray(json) && json.some((r) => isRecord(r) && typeof r.title === "string" && (PROMPTED.test(r.title) || (Array.isArray(r.products) && r.products.some((p) => typeof p === "string" && /gemini/i.test(p)))));
}
