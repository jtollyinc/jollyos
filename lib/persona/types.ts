/**
 * lib/persona/types — persona shapes, the privacy filter and pure helpers.
 * ────────────────────────────────────────────────────────────────────────────
 * Client-safe (no fs). Five kinds of entry (profile, value, preference, rule,
 * example), each with a privacy tag:
 *   public      fine anywhere, even a public bio
 *   cloud-ok    may go to a hosted model you trust with it
 *   local-only  never leaves this machine; only a local model sees it
 *
 * `filterForAudience` is the privacy boundary and is pure, so it is tested on
 * its own. `personaSegments` turns entries into the tagged ContextSegments
 * the provider router consumes — the router decides what is sent where, but
 * the tags originate here.
 */
import type { ImportSource } from "@/lib/import/types";
import type { ContextSegment, Privacy } from "@/lib/providers/types";

export type PersonaKind = "profile" | "value" | "preference" | "rule" | "example";
export type Audience = "cloud" | "local";

export const PERSONA_KINDS: { id: PersonaKind; label: string; hint: string }[] = [
  { id: "profile", label: "Profile", hint: "Who you are: role, situation, what you are working on." },
  { id: "value", label: "Values", hint: "What you optimise for, in order." },
  { id: "preference", label: "Preferences", hint: "Concrete defaults: free before paid, mornings for deep work." },
  { id: "rule", label: "Decision rules", hint: "When X, I do Y." },
  { id: "example", label: "Examples", hint: "A situation, the call you made, and why." },
];

export const PRIVACY_LEVELS: { id: Privacy; label: string; hint: string }[] = [
  { id: "public", label: "Public", hint: "Could be on your website." },
  { id: "cloud-ok", label: "Cloud OK", hint: "May be sent to a hosted model." },
  { id: "local-only", label: "Local only", hint: "Only a model on this machine ever sees it." },
];

/** Where an entry came from when it was imported (absent for hand-written entries). */
export interface EntrySource {
  kind: ImportSource;
  /** Human-readable pointer into the export, e.g. "Pricing page › message 3". */
  ref: string;
}

export interface PersonaEntry {
  id: string;
  kind: PersonaKind;
  text: string;
  privacy: Privacy;
  createdAt: string;
  updatedAt: string;
  source?: EntrySource;
}

export interface EntryInput {
  kind: PersonaKind;
  text: string;
  privacy: Privacy;
  source?: EntrySource;
}

export const isKind = (v: unknown): v is PersonaKind => PERSONA_KINDS.some((k) => k.id === v);
export const isPrivacy = (v: unknown): v is Privacy => PRIVACY_LEVELS.some((p) => p.id === v);

/** The boundary: a cloud audience never receives a local-only entry. */
export function filterForAudience<T extends { privacy: Privacy }>(entries: T[], audience: Audience): T[] {
  return audience === "local" ? entries : entries.filter((e) => e.privacy !== "local-only");
}

/** One tagged segment per entry, so the router can withhold them individually. */
export function personaSegments(entries: PersonaEntry[]): ContextSegment[] {
  const order: PersonaKind[] = ["profile", "value", "rule", "preference", "example"];
  return [...entries]
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
    .map((e) => ({ title: e.kind, text: `- ${e.text.trim()}`, privacy: e.privacy }));
}

export function personaCounts(entries: { privacy: Privacy }[]) {
  const by: Record<Privacy, number> = { public: 0, "cloud-ok": 0, "local-only": 0 };
  for (const e of entries) by[e.privacy]++;
  return { total: entries.length, ...by };
}
