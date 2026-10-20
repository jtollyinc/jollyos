/**
 * lib/persona/interests-store — the derived interest profile on disk.
 * SERVER-SIDE ONLY (fs).
 * ────────────────────────────────────────────────────────────────────────────
 * DATA_DIR/interests.json is recomputed by lib/persona/store on every persona
 * write (so approving imports refreshes it) and can be forced from the API.
 * It is derived data: deleting the file loses nothing. The Brief cache keys on
 * `version`, so a changed profile rebuilds the brief on the next read.
 *
 * This module must not import lib/persona/store (the store imports it).
 */
import { dataPath, fileExists, readJson, writeJson } from "@/lib/data-dir";
import { deriveInterests, EMPTY_PROFILE, type InterestInput, type InterestProfile } from "./interests";
import type { PersonaEntry } from "./types";

const file = () => dataPath("interests.json");

export function readInterests(): InterestProfile {
  const p = readJson<Partial<InterestProfile> | null>(file(), null);
  if (!p || !Array.isArray(p.interests) || !Array.isArray(p.avoid)) return EMPTY_PROFILE;
  return { interests: p.interests, avoid: p.avoid, version: p.version ?? "none", computedAt: p.computedAt ?? "" };
}

export function hasInterests(): boolean {
  return fileExists(file());
}

const toInput = (e: PersonaEntry): InterestInput => ({ id: e.id, text: e.text, privacy: e.privacy, source: e.source ? { kind: e.source.kind, ref: e.source.ref } : null });

export function refreshInterests(entries: PersonaEntry[]): InterestProfile {
  const profile = deriveInterests(entries.map(toInput));
  writeJson(file(), profile);
  return profile;
}
