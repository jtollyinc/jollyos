/**
 * lib/persona/deck-store — where swipes live. SERVER-SIDE ONLY (fs).
 * ────────────────────────────────────────────────────────────────────────────
 * Two files, split by privacy, so a cloud-safe read can never pick up a
 * private row by accident — the split is the filesystem, not a filter:
 *
 *   DATA_DIR/decisions.jsonl          cloud-ok answers
 *   DATA_DIR/private/decisions.jsonl  local-only answers
 *
 * The card's own tag decides the file; a request never names a privacy tier.
 */
import fs from "node:fs";
import { appendJsonl, dataPath, readJsonl } from "@/lib/data-dir";
import type { Privacy } from "@/lib/providers/types";
import { SEED_CARDS } from "@/modules/persona/cards";
import { tagCard, type DeckAnswer, type DeckChoice, type TaggedCard } from "./deck";

const answersFile = (privacy: Privacy) =>
  privacy === "local-only" ? dataPath("private", "decisions.jsonl") : dataPath("decisions.jsonl");

export function allCards(): TaggedCard[] {
  return SEED_CARDS.map(tagCard);
}

export interface ReadOptions {
  /** TRUE for the owner's own browser; FALSE for anything building a cloud prompt. */
  includePrivate: boolean;
}

export function readAnswers(opts: ReadOptions): DeckAnswer[] {
  const rows = readJsonl<DeckAnswer>(answersFile("cloud-ok"));
  if (opts.includePrivate) rows.push(...readJsonl<DeckAnswer>(answersFile("local-only")));
  return rows.sort((a, b) => a.at.localeCompare(b.at));
}

export interface RecordInput {
  cardId: string;
  choice: DeckChoice;
  ms: number;
  reason?: string;
}

/** Attach a reason to the most recent answer for a card, in its own tier's file. */
function attachReason(card: TaggedCard, reason: string): DeckAnswer {
  const file = answersFile(card.privacy);
  const rows = readJsonl<DeckAnswer>(file);
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].cardId !== card.id) continue;
    rows[i] = { ...rows[i], reason: reason.slice(0, 280) };
    fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
    return rows[i];
  }
  // Unreachable in practice (the caller only reaches here after confirming a
  // row exists), but keeps the return type honest instead of asserting.
  return { cardId: card.id, choice: "depends", ms: 0, category: card.category, privacy: card.privacy, at: new Date().toISOString(), reason };
}

export function recordAnswer(input: RecordInput): { ok: true; answer: DeckAnswer } | { ok: false; reason: string } {
  const card = allCards().find((c) => c.id === input.cardId);
  if (!card) return { ok: false, reason: "no such card" };
  if (input.choice !== "a" && input.choice !== "b" && input.choice !== "depends") {
    return { ok: false, reason: "choice must be a, b or depends" };
  }

  // A card is answered exactly once — nextCards() never re-offers one that
  // already has a row. A second POST for the same card is always a
  // resubmission (double tap, Enter racing the Save button, a retried
  // request), never a deliberate re-answer: merge into the existing row
  // instead of appending a duplicate.
  const existing = readAnswers({ includePrivate: true }).find((a) => a.cardId === input.cardId);
  if (existing) {
    const reason = input.reason?.trim();
    if (reason && !existing.reason) return { ok: true, answer: attachReason(card, reason) };
    return { ok: true, answer: existing };
  }

  const answer: DeckAnswer = {
    cardId: card.id,
    choice: input.choice,
    ms: Math.max(0, Math.round(Number.isFinite(input.ms) ? input.ms : 0)),
    category: card.category,
    privacy: card.privacy,
    at: new Date().toISOString(),
    ...(input.reason?.trim() ? { reason: input.reason.trim().slice(0, 280) } : {}),
  };
  appendJsonl(answersFile(answer.privacy), answer);
  return { ok: true, answer };
}

export function deckStats(opts: ReadOptions) {
  const answers = readAnswers(opts);
  const today = new Date().toISOString().slice(0, 10);
  return {
    answered: answers.length,
    today: answers.filter((a) => a.at.slice(0, 10) === today).length,
    localOnly: answers.filter((a) => a.privacy === "local-only").length,
    cards: allCards().length,
  };
}
