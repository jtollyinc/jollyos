/**
 * lib/import/parsers/markdown — mine a folder of .md / .txt notes.
 * ────────────────────────────────────────────────────────────────────────────
 * Obsidian vaults, Notion "Markdown & CSV" exports and any notes folder are
 * plain files, so there is no format to decode: each paragraph and each list
 * item becomes one MinedText with a pointer like "Working rules.md › Mornings
 * › line 12". Front matter, code fences and CSV files are skipped (CSV rows
 * are table data, not the owner's prose).
 */
import type { MinedText, ParseResult } from "../types";

export interface TextFile {
  name: string;
  text: string;
}

const NOTE_EXT = /\.(md|markdown|txt|text)$/i;

export const isNoteFile = (name: string) => NOTE_EXT.test(name);

function cleanLine(line: string): string {
  return line
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, "") // list markers and checkboxes
    .replace(/^\s*>\s?/, "")                                   // blockquote
    .replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")                   // links → text
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a: string, b?: string) => b ?? a) // wikilinks
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseMarkdownFile(file: TextFile): MinedText[] {
  const out: MinedText[] = [];
  const base = file.name.split("/").pop() ?? file.name;
  const lines = file.text.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  // Front matter.
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((l, idx) => idx > 0 && l.trim() === "---");
    if (end > 0) i = end + 1;
  }
  let heading = "";
  let inFence = false;
  let para: string[] = [];
  let paraStart = 0;
  const flush = () => {
    if (!para.length) return;
    const text = cleanLine(para.join(" "));
    if (text.length >= 12) out.push({ text, ref: `${base}${heading ? ` › ${heading}` : ""} › line ${paraStart + 1}`, kind: "note" });
    para = [];
  };
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) { flush(); inFence = !inFence; continue; }
    if (inFence) continue;
    const h = /^\s*#{1,6}\s+(.+)$/.exec(line);
    if (h) { flush(); heading = cleanLine(h[1]); continue; }
    if (!line.trim()) { flush(); continue; }
    if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) {
      flush();
      const text = cleanLine(line);
      if (text.length >= 12) out.push({ text, ref: `${base}${heading ? ` › ${heading}` : ""} › line ${i + 1}`, kind: "note" });
      continue;
    }
    if (/^\s*\|/.test(line) || /^\s*[-=]{3,}\s*$/.test(line)) { flush(); continue; } // tables, rules
    if (!para.length) paraStart = i;
    para.push(line);
  }
  flush();
  return out;
}

export function parseMarkdownFiles(files: TextFile[]): ParseResult {
  const items: MinedText[] = [];
  const warnings: string[] = [];
  const stats = { conversations: 0, messages: 0, files: 0, skipped: 0 };
  for (const f of files) {
    if (!isNoteFile(f.name)) { stats.skipped++; continue; }
    stats.files++;
    const mined = parseMarkdownFile(f);
    stats.messages += mined.length;
    items.push(...mined);
  }
  if (stats.skipped) warnings.push(`${stats.skipped} file${stats.skipped === 1 ? "" : "s"} skipped (only .md and .txt are read).`);
  if (!stats.files) warnings.push("No .md or .txt files found.");
  return { items, warnings, stats };
}
