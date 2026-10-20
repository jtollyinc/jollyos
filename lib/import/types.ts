/**
 * lib/import/types — shapes for "import your context". Client-safe (no fs).
 * ────────────────────────────────────────────────────────────────────────────
 * Importing is a pipeline with a hard stop in the middle:
 *
 *   export file / paste  →  parser  →  MinedText[]  (only the USER's own words)
 *   MinedText[]          →  extractor (rules | local model | cloud opt-in)
 *                        →  Candidate[]  (the REVIEW QUEUE, DATA_DIR/imports/)
 *   approve              →  one PersonaEntry per approved candidate
 *
 * Nothing enters the persona until the owner approves it. Every candidate is
 * born `local-only`; the owner may loosen that per item while reviewing.
 */
import type { PersonaKind } from "@/lib/persona/types";
import type { Privacy } from "@/lib/providers/types";

/** Where the material came from. Drives the parser and the how-to steps. */
export type ImportSource = "chatgpt" | "claude" | "gemini" | "notion" | "markdown" | "apple-notes" | "paste";

/** What kind of persona item a candidate would become. */
export type CandidateCategory = "preference" | "rule" | "fact" | "decision-pattern" | "value" | "interest" | "avoid";

export type ExtractionMode = "rules" | "local" | "cloud";

export type CandidateStatus = "pending" | "approved" | "rejected";

/** One unit of the owner's own writing, with a pointer back to where it was. */
export interface MinedText {
  text: string;
  /** Human-readable pointer: "conversations.json › Habit app pricing › message 4". */
  ref: string;
  /** How the text was framed where it came from. Memory dumps and instructions are richer per line. */
  kind: "message" | "note" | "memory" | "instruction";
  at?: string | null;
}

export interface ParseStats {
  conversations: number;
  messages: number;
  files: number;
  skipped: number;
}

export interface ParseResult {
  items: MinedText[];
  warnings: string[];
  stats: ParseStats;
}

/** The extractor's output before it is queued (no id, no status yet). */
export interface ExtractedItem {
  category: CandidateCategory;
  text: string;
  ref: string;
  /** 0..1, deterministic for the rule-based extractor. */
  confidence: number;
}

export interface Candidate extends ExtractedItem {
  id: string;
  batchId: string;
  source: ImportSource;
  sourceRef: string;
  privacy: Privacy;
  mode: ExtractionMode;
  status: CandidateStatus;
  createdAt: string;
  reviewedAt?: string;
  /** Set once approved: the persona entry it became. */
  personaEntryId?: string;
}

export interface ImportBatch {
  id: string;
  source: ImportSource;
  mode: ExtractionMode;
  createdAt: string;
  files: { name: string; bytes: number }[];
  candidates: number;
  warnings: string[];
  /** Provider label when a model did the extraction; null for rules. */
  provider: string | null;
}

/** Candidate category → the persona kind it becomes on approval. */
export const KIND_FOR_CATEGORY: Record<CandidateCategory, PersonaKind> = {
  preference: "preference",
  rule: "rule",
  fact: "profile",
  "decision-pattern": "example",
  value: "value",
  interest: "preference",
  avoid: "preference",
};

export const CATEGORIES: { id: CandidateCategory; label: string }[] = [
  { id: "preference", label: "Preference" },
  { id: "rule", label: "Rule" },
  { id: "fact", label: "Fact" },
  { id: "value", label: "Value" },
  { id: "decision-pattern", label: "Decision pattern" },
  { id: "interest", label: "Interest" },
  { id: "avoid", label: "Avoid topic" },
];

export const isCategory = (v: unknown): v is CandidateCategory => CATEGORIES.some((c) => c.id === v);
export const isMode = (v: unknown): v is ExtractionMode => v === "rules" || v === "local" || v === "cloud";
export const isSource = (v: unknown): v is ImportSource =>
  v === "chatgpt" || v === "claude" || v === "gemini" || v === "notion" || v === "markdown" || v === "apple-notes" || v === "paste";

/** Every imported item starts here; the owner can loosen it per item. */
export const DEFAULT_IMPORT_PRIVACY: Privacy = "local-only";
