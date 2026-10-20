/**
 * lib/import/parse — turn uploaded bytes (or a paste) into MinedText, whatever
 * the format. Node-only (Buffer, zlib) but no fs: the caller hands it bytes.
 * ────────────────────────────────────────────────────────────────────────────
 * Zips are expanded (export archives, zipped notes folders). JSON is sniffed
 * by SHAPE, not by file name, so a ChatGPT conversations.json uploaded under
 * the Claude tile still parses — with a warning. Unknown files are listed in
 * the warnings, never fatal.
 */
import { parseChatGpt, looksLikeChatGpt } from "./parsers/chatgpt";
import { looksLikeClaude, looksLikeClaudeProjects, parseClaude, parseClaudeProjects } from "./parsers/claude";
import { looksLikeGeminiActivity, parseGeminiActivity } from "./parsers/gemini";
import { isNoteFile, parseMarkdownFiles, type TextFile } from "./parsers/markdown";
import { parsePaste } from "./parsers/paste";
import type { ImportSource, MinedText, ParseResult, ParseStats } from "./types";
import { isZip, unzip } from "./zip";

export interface RawFile {
  name: string;
  data: Buffer;
}

export interface ParseInput {
  source: ImportSource;
  files?: RawFile[];
  paste?: string;
}

export interface ParsedUpload extends ParseResult {
  /** Which parsers actually fired, for the receipt line. */
  detected: string[];
}

const emptyStats = (): ParseStats => ({ conversations: 0, messages: 0, files: 0, skipped: 0 });

function merge(into: ParsedUpload, r: ParseResult, detected: string) {
  into.items.push(...r.items);
  into.warnings.push(...r.warnings);
  into.stats.conversations += r.stats.conversations;
  into.stats.messages += r.stats.messages;
  into.stats.files += r.stats.files;
  into.stats.skipped += r.stats.skipped;
  if (r.items.length && !into.detected.includes(detected)) into.detected.push(detected);
}

function expand(files: RawFile[], depth = 0): { files: RawFile[]; warnings: string[] } {
  const out: RawFile[] = [];
  const warnings: string[] = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name) || isZip(f.data)) {
      if (depth > 1) { warnings.push(`${f.name}: nested archive skipped.`); continue; }
      try {
        const z = unzip(f.data);
        warnings.push(...z.skipped.map((s) => `${f.name}: skipped ${s}`));
        const inner = expand(z.entries.map((e) => ({ name: e.name, data: e.data })), depth + 1);
        out.push(...inner.files);
        warnings.push(...inner.warnings);
      } catch (err) {
        warnings.push(`${f.name}: ${err instanceof Error ? err.message : "could not read the archive"}`);
      }
    } else {
      out.push(f);
    }
  }
  return { files: out, warnings };
}

export function parseUpload(input: ParseInput): ParsedUpload {
  const result: ParsedUpload = { items: [], warnings: [], stats: emptyStats(), detected: [] };
  const { files, warnings } = expand(input.files ?? []);
  result.warnings.push(...warnings);

  const notes: TextFile[] = [];
  for (const f of files) {
    const base = f.name.split("/").pop() ?? f.name;
    if (/\.json$/i.test(base)) {
      let json: unknown;
      try { json = JSON.parse(f.data.toString("utf8")); } catch { result.warnings.push(`${base}: not valid JSON, skipped.`); result.stats.skipped++; continue; }
      if (looksLikeChatGpt(json)) {
        if (input.source !== "chatgpt") result.warnings.push(`${base} looks like a ChatGPT export; parsed it as one.`);
        merge(result, parseChatGpt(json), "ChatGPT conversations");
      } else if (looksLikeClaude(json)) {
        if (input.source !== "claude") result.warnings.push(`${base} looks like a Claude export; parsed it as one.`);
        merge(result, parseClaude(json), "Claude conversations");
      } else if (looksLikeClaudeProjects(json)) {
        merge(result, parseClaudeProjects(json), "Claude projects");
      } else if (looksLikeGeminiActivity(json)) {
        if (input.source !== "gemini") result.warnings.push(`${base} looks like Google activity JSON; parsed it as Gemini activity.`);
        merge(result, parseGeminiActivity(json), "Gemini activity");
      } else {
        result.warnings.push(`${base}: JSON, but not a shape this importer knows (ChatGPT, Claude, Gemini activity). Skipped.`);
        result.stats.skipped++;
      }
    } else if (isNoteFile(base)) {
      notes.push({ name: f.name, text: f.data.toString("utf8") });
    } else if (/\.(html?|csv|pdf|png|jpe?g|gif|webp|mp3|wav|m4a|mp4|mov|docx?|xlsx?|pptx?)$/i.test(base)) {
      result.stats.skipped++;
    } else {
      result.warnings.push(`${base}: unknown file type, skipped.`);
      result.stats.skipped++;
    }
  }
  if (notes.length) merge(result, parseMarkdownFiles(notes), "notes");
  if (result.stats.skipped && !result.warnings.some((w) => /skipped/.test(w))) {
    result.warnings.push(`${result.stats.skipped} file${result.stats.skipped === 1 ? "" : "s"} skipped (attachments, HTML, CSV and media are not read).`);
  }

  if (input.paste && input.paste.trim()) merge(result, parsePaste(input.paste), "pasted text");

  if (!files.length && !(input.paste && input.paste.trim())) result.warnings.push("Nothing to import: add a file or paste some text.");
  return result;
}

export type { MinedText };
