/**
 * lib/import/queue — the review queue and the raw uploads. SERVER-SIDE ONLY (fs).
 * ────────────────────────────────────────────────────────────────────────────
 *   DATA_DIR/imports/queue.json     every candidate, pending or reviewed
 *   DATA_DIR/imports/batches.json   one row per import run (source, mode, files)
 *   DATA_DIR/imports/raw/<batch>/   the uploaded bytes, kept so the owner can
 *                                   re-run extraction; "Delete raw files" wipes it
 *
 * Approving a candidate is the ONLY path from the queue into the persona, and
 * it goes through lib/persona/store.addEntry, which also refreshes the derived
 * interests. Rejecting leaves a tombstone so a re-import does not resurface the
 * same text. Everything here is local JSON; nothing talks to a model.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataPath, readJson, writeJson } from "@/lib/data-dir";
import { addEntry, isKind, isPrivacy, type PersonaEntry } from "@/lib/persona/store";
import type { Privacy } from "@/lib/providers/types";
import { type Candidate, type CandidateCategory, DEFAULT_IMPORT_PRIVACY, type ExtractedItem, type ExtractionMode, type ImportBatch, type ImportSource, isCategory, KIND_FOR_CATEGORY } from "./types";

const queueFile = () => dataPath("imports", "queue.json");
const batchesFile = () => dataPath("imports", "batches.json");
const rawDir = () => dataPath("imports", "raw");

export function readQueue(): Candidate[] {
  return readJson<{ candidates: Candidate[] }>(queueFile(), { candidates: [] }).candidates;
}
function writeQueue(candidates: Candidate[]) {
  writeJson(queueFile(), { candidates });
}
export function readBatches(): ImportBatch[] {
  return readJson<{ batches: ImportBatch[] }>(batchesFile(), { batches: [] }).batches;
}
function writeBatches(batches: ImportBatch[]) {
  writeJson(batchesFile(), { batches });
}

const safeName = (name: string) => (name.split(/[\\/]/).pop() ?? "file").replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 120) || "file";

export interface NewBatch {
  source: ImportSource;
  mode: ExtractionMode;
  files: { name: string; data: Buffer }[];
  warnings: string[];
  provider: string | null;
  /** Keep the bytes under imports/raw (default true). */
  keepRaw?: boolean;
  /** Files read in place (a folder inside DATA_DIR): listed, never copied. */
  extraFiles?: { name: string; bytes: number }[];
}

export function createBatch(input: NewBatch): ImportBatch {
  const id = `${new Date().toISOString().slice(0, 10)}-${crypto.randomBytes(3).toString("hex")}`;
  const files: ImportBatch["files"] = [];
  if (input.keepRaw !== false && input.files.length) {
    const dir = path.join(rawDir(), id);
    fs.mkdirSync(dir, { recursive: true });
    const used = new Set<string>();
    for (const f of input.files) {
      let name = safeName(f.name);
      while (used.has(name)) name = `${crypto.randomBytes(2).toString("hex")}-${name}`;
      used.add(name);
      fs.writeFileSync(path.join(dir, name), f.data);
      files.push({ name, bytes: f.data.length });
    }
  } else {
    for (const f of input.files) files.push({ name: safeName(f.name), bytes: f.data.length });
  }
  for (const f of input.extraFiles ?? []) files.push({ name: f.name.slice(0, 160), bytes: f.bytes });
  const batch: ImportBatch = { id, source: input.source, mode: input.mode, createdAt: new Date().toISOString(), files, candidates: 0, warnings: input.warnings.slice(0, 20), provider: input.provider };
  writeBatches([...readBatches(), batch]);
  return batch;
}

const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Queue extracted items. Text already in the queue (any status) is not added twice. */
export function enqueue(batch: ImportBatch, items: ExtractedItem[]): Candidate[] {
  const queue = readQueue();
  const seen = new Set(queue.map((c) => normKey(c.text)));
  const now = new Date().toISOString();
  const added: Candidate[] = [];
  for (const it of items) {
    const key = normKey(it.text);
    if (seen.has(key)) continue;
    seen.add(key);
    added.push({
      id: crypto.randomUUID(), batchId: batch.id, category: it.category, text: it.text.slice(0, 1000), ref: it.ref, confidence: it.confidence,
      source: batch.source, sourceRef: it.ref.slice(0, 200), privacy: DEFAULT_IMPORT_PRIVACY, mode: batch.mode, status: "pending", createdAt: now,
    });
  }
  writeQueue([...queue, ...added]);
  const batches = readBatches();
  const row = batches.find((b) => b.id === batch.id);
  if (row) { row.candidates += added.length; writeBatches(batches); }
  return added;
}

export interface ReviewEdits {
  text?: string;
  category?: CandidateCategory;
  privacy?: Privacy;
}

export type ReviewAction = "approve" | "reject" | "edit" | "reset";

export interface ReviewResult {
  candidate: Candidate;
  entry: PersonaEntry | null;
}

/**
 * approve → persona entry (kind from category, privacy as reviewed, source attached);
 * reject  → tombstone; edit → change text/category/privacy while pending; reset → back to pending.
 */
export function reviewCandidate(id: string, action: ReviewAction, edits: ReviewEdits = {}): ReviewResult | null {
  const queue = readQueue();
  const c = queue.find((x) => x.id === id);
  if (!c) return null;
  if (edits.text !== undefined && edits.text.trim()) c.text = edits.text.trim().slice(0, 1000);
  if (edits.category && isCategory(edits.category)) c.category = edits.category;
  if (edits.privacy && isPrivacy(edits.privacy)) c.privacy = edits.privacy;

  let entry: PersonaEntry | null = null;
  if (action === "approve") {
    if (c.status === "approved") return { candidate: c, entry: null }; // idempotent: no duplicate entry
    const kind = KIND_FOR_CATEGORY[c.category];
    if (!isKind(kind)) throw new Error(`No persona kind for ${c.category}`);
    entry = addEntry({ kind, text: c.text, privacy: c.privacy, source: { kind: c.source, ref: c.sourceRef } });
    c.status = "approved";
    c.personaEntryId = entry.id;
    c.reviewedAt = new Date().toISOString();
  } else if (action === "reject") {
    c.status = "rejected";
    c.reviewedAt = new Date().toISOString();
  } else if (action === "reset") {
    c.status = "pending";
    delete c.reviewedAt;
  }
  writeQueue(queue);
  return { candidate: c, entry };
}

/** Approve or reject many at once; `ids` empty = every pending candidate (optionally above a confidence). */
export function bulkReview(action: "approve" | "reject", opts: { ids?: string[]; minConfidence?: number } = {}): { count: number } {
  const queue = readQueue();
  const wanted = new Set(opts.ids ?? []);
  const targets = queue.filter((c) => c.status === "pending" && (wanted.size ? wanted.has(c.id) : true) && (opts.minConfidence === undefined || c.confidence >= opts.minConfidence));
  let count = 0;
  for (const c of targets) { if (reviewCandidate(c.id, action)) count++; }
  return { count };
}

/** Drop reviewed rows older than the queue needs (keeps rejected tombstones). */
export function clearApproved(): number {
  const queue = readQueue();
  const next = queue.filter((c) => c.status !== "approved");
  writeQueue(next);
  return queue.length - next.length;
}

export function rawFilesSummary(): { files: number; bytes: number; batches: number } {
  let files = 0;
  let bytes = 0;
  let batches = 0;
  const dir = rawDir();
  if (fs.existsSync(dir)) {
    for (const b of fs.readdirSync(dir)) {
      const bd = path.join(dir, b);
      if (!fs.statSync(bd).isDirectory()) continue;
      batches++;
      for (const f of fs.readdirSync(bd)) { files++; bytes += fs.statSync(path.join(bd, f)).size; }
    }
  }
  return { files, bytes, batches };
}

/** Remove every raw upload. Candidates and the persona are untouched. */
export function deleteRawFiles(): { files: number; bytes: number } {
  const before = rawFilesSummary();
  fs.rmSync(rawDir(), { recursive: true, force: true });
  const batches = readBatches().map((b) => ({ ...b, files: b.files.map((f) => ({ ...f, bytes: 0 })) }));
  writeBatches(batches);
  return { files: before.files, bytes: before.bytes };
}

export function queueCounts(queue: Candidate[] = readQueue()) {
  const by = { pending: 0, approved: 0, rejected: 0 };
  for (const c of queue) by[c.status]++;
  return { total: queue.length, ...by };
}
