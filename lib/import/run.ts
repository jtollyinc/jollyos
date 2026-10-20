/**
 * lib/import/run — one import, end to end, as a function the API route calls.
 * SERVER-SIDE ONLY.
 * ────────────────────────────────────────────────────────────────────────────
 *   authorize(mode, opt-in)  →  parse bytes/paste  →  extract (rules | model)
 *   →  batch row + raw files  →  enqueue candidates (all local-only)
 *
 * It returns a status code and a body instead of a Response so the whole
 * path, including the cloud gate, is unit-tested without Next's request scope.
 * The gate runs FIRST: a cloud request without opt-in never reaches a parser.
 */
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "@/lib/data-dir";
import { providersFromEnv, type ProviderSet } from "@/lib/providers";
import { extractCandidates } from "./extract";
import { authorizeExtraction, extractWithModel } from "./modes";
import { parseUpload, type RawFile } from "./parse";
import { isNoteFile } from "./parsers/markdown";
import { createBatch, enqueue } from "./queue";
import type { Candidate, ExtractionMode, ImportBatch, ImportSource, ParseStats } from "./types";

export interface RunInput {
  source: ImportSource;
  mode: ExtractionMode;
  cloudOptIn: boolean;
  files?: RawFile[];
  paste?: string;
  /** A folder of notes INSIDE DATA_DIR (never elsewhere). */
  folder?: string;
  /** Store the uploaded bytes under imports/raw (default true). */
  keepRaw?: boolean;
}

export interface RunOk {
  batch: ImportBatch;
  added: Candidate[];
  warnings: string[];
  stats: ParseStats;
  detected: string[];
  extraction: { mode: ExtractionMode; note: string; provider: string | null; fromModel: number; fromRules: number };
}

export type RunResult = { status: 201; body: RunOk } | { status: 400 | 403 | 409; body: { error: string; options?: ExtractionMode[] } };

const MAX_FOLDER_FILES = 500;
const MAX_FOLDER_BYTES = 20 * 1024 * 1024;

/** Resolve `folder` inside DATA_DIR or return null. */
export function resolveFolderInDataDir(folder: string): string | null {
  const root = path.resolve(dataDir());
  const target = path.resolve(root, folder.replace(/^[\\/]+/, ""));
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  return target;
}

function readFolder(dir: string): { files: RawFile[]; warning: string | null } {
  const files: RawFile[] = [];
  let bytes = 0;
  let warning: string | null = null;
  const walk = (d: string, rel: string) => {
    for (const name of fs.readdirSync(d)) {
      if (name.startsWith(".")) continue;
      const full = path.join(d, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) { walk(full, rel ? `${rel}/${name}` : name); continue; }
      if (!isNoteFile(name)) continue;
      if (files.length >= MAX_FOLDER_FILES || bytes + st.size > MAX_FOLDER_BYTES) { warning = `Folder is large; only the first ${files.length} notes were read.`; return; }
      bytes += st.size;
      files.push({ name: rel ? `${rel}/${name}` : name, data: fs.readFileSync(full) });
    }
  };
  walk(dir, "");
  return { files, warning };
}

export async function runImport(input: RunInput, providers: ProviderSet = providersFromEnv()): Promise<RunResult> {
  const auth = authorizeExtraction(input.mode, input.cloudOptIn, providers);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error, options: auth.options } };

  const uploads = input.files ?? [];
  const folderFiles: RawFile[] = [];
  const warnings: string[] = [];
  if (input.folder && input.folder.trim()) {
    const dir = resolveFolderInDataDir(input.folder.trim());
    if (!dir) return { status: 400, body: { error: "The folder must be inside DATA_DIR." } };
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return { status: 400, body: { error: "That folder does not exist inside DATA_DIR." } };
    const r = readFolder(dir);
    folderFiles.push(...r.files);
    if (r.warning) warnings.push(r.warning);
    if (!r.files.length) warnings.push("No .md or .txt files in that folder.");
  }
  if (!uploads.length && !folderFiles.length && !(input.paste && input.paste.trim())) {
    return { status: 400, body: { error: "Nothing to import: add a file, a folder, or paste some text." } };
  }

  const parsed = parseUpload({ source: input.source, files: [...uploads, ...folderFiles], paste: input.paste });
  warnings.push(...parsed.warnings);

  let items;
  let fromModel = 0;
  let fromRules = 0;
  let note = auth.note;
  if (auth.mode === "rules" || !auth.provider) {
    const r = extractCandidates(parsed.items);
    items = r.items;
    fromRules = r.items.length;
    if (r.truncated) warnings.push("More than 400 candidates; only the most confident were queued.");
  } else {
    const r = await extractWithModel(parsed.items, auth.mode, providers);
    items = r.items;
    fromModel = r.fromModel;
    fromRules = r.fromRules;
    note = `${auth.note} ${r.note}.`;
  }

  const batch = createBatch({
    source: input.source,
    mode: auth.mode,
    files: uploads,
    extraFiles: folderFiles.map((f) => ({ name: f.name, bytes: f.data.length })),
    warnings,
    provider: auth.provider?.label ?? null,
    keepRaw: input.keepRaw,
  });
  const added = enqueue(batch, items);
  if (!added.length && items.length) warnings.push("Everything found was already in the queue.");

  return {
    status: 201,
    body: { batch, added, warnings, stats: parsed.stats, detected: parsed.detected, extraction: { mode: auth.mode, note, provider: auth.provider?.label ?? null, fromModel, fromRules } },
  };
}
