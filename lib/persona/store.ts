/**
 * lib/persona/store — the model of "you" on disk. SERVER-SIDE ONLY (fs).
 * ────────────────────────────────────────────────────────────────────────────
 * CRUD over DATA_DIR/persona.json. The shapes, the privacy filter and the
 * segment builder live in lib/persona/types.ts (client-safe) and are
 * re-exported here for server callers.
 */
import crypto from "node:crypto";
import { dataPath, readJson, writeJson } from "@/lib/data-dir";

import { refreshInterests } from "./interests-store";
import { type EntryInput, type PersonaEntry } from "./types";

export * from "./types";

// ── Storage ────────────────────────────────────────────────────────────────

interface PersonaFile {
  entries: PersonaEntry[];
}

const file = () => dataPath("persona.json");

export function readEntries(): PersonaEntry[] {
  return readJson<PersonaFile>(file(), { entries: [] }).entries;
}

/** Every write re-derives the interest profile (lib/persona/interests-store) so the Brief follows the persona. */
function writeEntries(entries: PersonaEntry[]): void {
  writeJson(file(), { entries });
  refreshInterests(entries);
}

export function addEntry(input: EntryInput): PersonaEntry {
  const text = input.text.trim().slice(0, 1000);
  if (!text) throw new Error("Entry text is required.");
  const now = new Date().toISOString();
  const entry: PersonaEntry = { id: crypto.randomUUID(), kind: input.kind, text, privacy: input.privacy, createdAt: now, updatedAt: now };
  if (input.source) entry.source = { kind: input.source.kind, ref: input.source.ref.slice(0, 200) };
  writeEntries([...readEntries(), entry]);
  return entry;
}

export function updateEntry(id: string, patch: Partial<EntryInput>): PersonaEntry | null {
  const entries = readEntries();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return null;
  if (patch.text !== undefined) entry.text = patch.text.trim().slice(0, 1000) || entry.text;
  if (patch.kind) entry.kind = patch.kind;
  if (patch.privacy) entry.privacy = patch.privacy;
  entry.updatedAt = new Date().toISOString();
  writeEntries(entries);
  return entry;
}

export function deleteEntry(id: string): boolean {
  const entries = readEntries();
  const next = entries.filter((e) => e.id !== id);
  if (next.length === entries.length) return false;
  writeEntries(next);
  return true;
}
