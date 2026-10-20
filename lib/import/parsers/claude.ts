/**
 * lib/import/parsers/claude — mine a claude.ai data export.
 * ────────────────────────────────────────────────────────────────────────────
 * Shape supported (as observed in exports; Anthropic does not publish a schema):
 *   conversations.json: [ { uuid, name, created_at, chat_messages: [
 *       { sender: "human" | "assistant", text, content?: [{ type: "text", text }], created_at } ] } ]
 *   projects.json:      [ { uuid, name, description?, prompt_template?, docs?: [{ filename, content }] } ]
 *
 * Only `sender: "human"` turns are mined (the owner's words). A project's
 * `prompt_template` is the owner's own instructions, so it is mined as an
 * instruction. Unknown fields are ignored; malformed rows are skipped, never
 * thrown.
 */
import type { MinedText, ParseResult } from "../types";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function turnText(m: Record<string, unknown>): string {
  if (typeof m.text === "string" && m.text.trim()) return m.text;
  if (Array.isArray(m.content)) {
    return m.content
      .filter((c): c is Record<string, unknown> => isRecord(c) && c.type === "text" && typeof c.text === "string")
      .map((c) => c.text as string)
      .join("\n");
  }
  return "";
}

export function parseClaude(json: unknown, opts: { senders?: string[] } = {}): ParseResult {
  const senders = new Set(opts.senders ?? ["human"]);
  const items: MinedText[] = [];
  const warnings: string[] = [];
  const stats = { conversations: 0, messages: 0, files: 1, skipped: 0 };

  const list: unknown[] = Array.isArray(json) ? json : isRecord(json) && Array.isArray(json.conversations) ? json.conversations : [];
  if (!list.length) {
    warnings.push("No conversations found. Expected the conversations.json from a Claude data export (an array with `chat_messages` per conversation).");
    return { items, warnings, stats };
  }
  for (const raw of list) {
    if (!isRecord(raw) || !Array.isArray(raw.chat_messages)) { stats.skipped++; continue; }
    const title = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "Untitled conversation";
    stats.conversations++;
    let n = 0;
    for (const m of raw.chat_messages) {
      if (!isRecord(m)) continue;
      n++;
      if (!senders.has(typeof m.sender === "string" ? m.sender : "")) continue;
      const text = turnText(m).trim();
      if (!text) continue;
      stats.messages++;
      items.push({ text, ref: `${title} › message ${n}`, kind: "message", at: typeof m.created_at === "string" ? m.created_at : null });
    }
  }
  if (!items.length) warnings.push("The export parsed, but none of the conversations contained human-authored text.");
  return { items, warnings, stats };
}

/** projects.json: the owner's own project instructions. */
export function parseClaudeProjects(json: unknown): ParseResult {
  const items: MinedText[] = [];
  const stats = { conversations: 0, messages: 0, files: 1, skipped: 0 };
  const list: unknown[] = Array.isArray(json) ? json : [];
  for (const raw of list) {
    if (!isRecord(raw)) { stats.skipped++; continue; }
    const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "Untitled project";
    const tpl = typeof raw.prompt_template === "string" ? raw.prompt_template.trim() : "";
    if (tpl) items.push({ text: tpl, ref: `project › ${name} › instructions`, kind: "instruction" });
    if (typeof raw.description === "string" && raw.description.trim()) items.push({ text: raw.description.trim(), ref: `project › ${name} › description`, kind: "note" });
  }
  return { items, warnings: [], stats };
}

export function looksLikeClaude(json: unknown): boolean {
  const list: unknown[] = Array.isArray(json) ? json : isRecord(json) && Array.isArray(json.conversations) ? json.conversations : [];
  return list.some((c) => isRecord(c) && Array.isArray(c.chat_messages));
}

export function looksLikeClaudeProjects(json: unknown): boolean {
  return Array.isArray(json) && json.some((p) => isRecord(p) && ("prompt_template" in p || "docs" in p));
}
