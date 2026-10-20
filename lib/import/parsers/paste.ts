/**
 * lib/import/parsers/paste — mine pasted text: memory dumps, custom
 * instructions, Apple Notes, anything.
 * ────────────────────────────────────────────────────────────────────────────
 * The paste box is the universal fallback. Section headings that look like a
 * memory or instructions page ("Saved memories", "Custom instructions", "What
 * would you like ChatGPT to know about you?") switch the line kind so the
 * extractor can trust those lines more. Bullets become one item each;
 * paragraphs are kept whole (the extractor splits sentences).
 */
import type { MinedText, ParseResult } from "../types";

const MEMORY_HEAD = /^(#+\s*)?(saved )?memor(y|ies)\b|what (chatgpt|claude|gemini|the assistant) (knows|remembers) about (you|me)|memory summary/i;
const INSTRUCTION_HEAD = /^(#+\s*)?(custom|system|project|personal) instructions?\b|what would you like .* to know|how would you like .* to respond|response style|about me/i;
const BULLET = /^\s*(?:[-*•·]|\d+[.)])\s+/;

export function parsePaste(text: string, label = "pasted text"): ParseResult {
  const items: MinedText[] = [];
  const warnings: string[] = [];
  const stats = { conversations: 0, messages: 0, files: 1, skipped: 0 };
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let kind: MinedText["kind"] = "note";
  let para: string[] = [];
  let paraStart = 0;
  const push = (t: string, line: number, k: MinedText["kind"]) => {
    const clean = t.replace(/\s+/g, " ").trim();
    if (clean.length < 8) return;
    items.push({ text: clean, ref: `${label} › line ${line}`, kind: k });
  };
  const flush = () => { if (para.length) push(para.join(" "), paraStart + 1, kind); para = []; };

  lines.forEach((line, i) => {
    const t = line.trim();
    if (!t) { flush(); return; }
    if (MEMORY_HEAD.test(t) && t.length < 80) { flush(); kind = "memory"; return; }
    if (INSTRUCTION_HEAD.test(t) && t.length < 80) { flush(); kind = "instruction"; return; }
    if (/^#{1,6}\s/.test(t) && t.length < 80) { flush(); return; }
    if (BULLET.test(t)) { flush(); push(t.replace(BULLET, ""), i + 1, kind === "note" ? "memory" : kind); return; }
    // Memory pages and instruction boxes are line-oriented: one item per line.
    if (kind !== "note") { flush(); push(t, i + 1, kind); return; }
    if (!para.length) paraStart = i;
    para.push(t);
  });
  flush();
  stats.messages = items.length;
  if (!items.length) warnings.push("Nothing usable in the pasted text.");
  return { items, warnings, stats };
}
