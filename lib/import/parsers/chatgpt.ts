/**
 * lib/import/parsers/chatgpt — mine a ChatGPT data export's conversations.json.
 * ────────────────────────────────────────────────────────────────────────────
 * Shape supported (as observed in exports; OpenAI does not publish a schema):
 *   [ { title, create_time, update_time, current_node, mapping: {
 *       <nodeId>: { id, parent, children: [...], message: null | {
 *         author: { role: "user" | "assistant" | "system" | "tool" },
 *         create_time, content: { content_type, parts?: (string | object)[], text? },
 *         metadata?: { is_visually_hidden_from_conversation?: boolean } } } } } ]
 *
 * The mapping is a TREE (edits and regenerations fork it). We follow the
 * active branch: from `current_node` back to the root when present, else from
 * the root down the LAST child at every fork. By default only the USER's
 * messages are mined — the assistant's words are not the owner's. Unknown
 * fields are ignored; a conversation that does not look like one is counted
 * in `skipped`, never thrown.
 */
import type { MinedText, ParseResult } from "../types";

interface Node {
  id?: string;
  parent?: string | null;
  children?: unknown;
  message?: Message | null;
}
interface Message {
  author?: { role?: unknown };
  create_time?: unknown;
  content?: { content_type?: unknown; parts?: unknown; text?: unknown };
  metadata?: { is_visually_hidden_from_conversation?: unknown };
}
interface Conversation {
  title?: unknown;
  create_time?: unknown;
  current_node?: unknown;
  mapping?: unknown;
}

export interface ChatGptOptions {
  /** Author roles to keep. Default: only the user. */
  roles?: string[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function messageText(m: Message): string {
  const c = m.content;
  if (!c) return "";
  if (typeof c.text === "string") return c.text;
  if (Array.isArray(c.parts)) return c.parts.filter((p): p is string => typeof p === "string").join("\n");
  return "";
}

function epochToIso(v: unknown): string | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return new Date(v * 1000).toISOString();
}

/** Ordered node ids along the active branch. */
export function activePath(mapping: Record<string, Node>, currentNode: unknown): string[] {
  if (typeof currentNode === "string" && mapping[currentNode]) {
    const path: string[] = [];
    const seen = new Set<string>();
    let id: string | null | undefined = currentNode;
    while (id && mapping[id] && !seen.has(id)) {
      seen.add(id);
      path.push(id);
      id = mapping[id].parent ?? null;
    }
    return path.reverse();
  }
  const root = Object.keys(mapping).find((k) => { const par = mapping[k].parent; return !par || !mapping[par]; });
  if (!root) return [];
  const path: string[] = [];
  const seen = new Set<string>();
  let id: string | undefined = root;
  while (id && mapping[id] && !seen.has(id)) {
    seen.add(id);
    path.push(id);
    const kids: unknown = mapping[id].children;
    const list: string[] = Array.isArray(kids) ? kids.filter((k): k is string => typeof k === "string" && Boolean(mapping[k])) : [];
    id = list[list.length - 1];
  }
  return path;
}

export function parseChatGpt(json: unknown, opts: ChatGptOptions = {}): ParseResult {
  const roles = new Set(opts.roles ?? ["user"]);
  const items: MinedText[] = [];
  const warnings: string[] = [];
  const stats = { conversations: 0, messages: 0, files: 1, skipped: 0 };

  const list: unknown[] = Array.isArray(json) ? json : isRecord(json) && Array.isArray(json.conversations) ? json.conversations : [];
  if (!list.length) {
    warnings.push("No conversations found. Expected the conversations.json from a ChatGPT data export (an array with a `mapping` per conversation).");
    return { items, warnings, stats };
  }

  for (const raw of list) {
    if (!isRecord(raw) || !isRecord(raw.mapping)) { stats.skipped++; continue; }
    const conv = raw as Conversation;
    const mapping = conv.mapping as Record<string, Node>;
    const title = typeof conv.title === "string" && conv.title.trim() ? conv.title.trim() : "Untitled conversation";
    const path = activePath(mapping, conv.current_node);
    if (!path.length) { stats.skipped++; continue; }
    stats.conversations++;

    let n = 0;
    for (const id of path) {
      const m = mapping[id]?.message;
      if (!m || typeof m !== "object") continue;
      n++;
      const role = typeof m.author?.role === "string" ? m.author.role : "";
      if (!roles.has(role)) continue;
      if (m.metadata?.is_visually_hidden_from_conversation === true) continue;
      const text = messageText(m).trim();
      if (!text) continue;
      stats.messages++;
      items.push({ text, ref: `${title} › message ${n}`, kind: "message", at: epochToIso(m.create_time) });
    }
  }
  if (!items.length) warnings.push("The export parsed, but none of the conversations contained user-authored text.");
  return { items, warnings, stats };
}

/** `true` when a parsed JSON value looks like a ChatGPT export. */
export function looksLikeChatGpt(json: unknown): boolean {
  const list: unknown[] = Array.isArray(json) ? json : isRecord(json) && Array.isArray(json.conversations) ? json.conversations : [];
  return list.some((c) => isRecord(c) && isRecord(c.mapping));
}
