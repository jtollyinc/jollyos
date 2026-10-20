/**
 * GET  /api/persona/deck                     next cards + stats + reveal
 * POST /api/persona/deck { cardId, choice, ms, reason? }   log one swipe
 */
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { ensureDemoSeeded } from "@/lib/demo";
import { REVEAL_EVERY, nextCards, streakDays, summariseSession, type DeckChoice } from "@/lib/persona/deck";
import { allCards, deckStats, readAnswers, recordAnswer } from "@/lib/persona/deck-store";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  ensureDemoSeeded();
  const opts = { includePrivate: true };
  const cards = allCards();
  const answers = readAnswers(opts);
  return NextResponse.json({
    cards: nextCards(cards, answers),
    allCards: cards,
    stats: deckStats(opts),
    streak: streakDays(answers),
    reveal: summariseSession(answers, cards),
    revealEvery: REVEAL_EVERY,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  const body = (await req.json().catch(() => null)) as { cardId?: string; choice?: string; ms?: number; reason?: string } | null;
  if (!body?.cardId || !body.choice) return NextResponse.json({ error: "cardId and choice are required" }, { status: 400 });
  const res = recordAnswer({ cardId: body.cardId, choice: body.choice as DeckChoice, ms: Number(body.ms ?? 0), reason: body.reason });
  if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });
  return NextResponse.json({ ok: true, answer: res.answer }, { status: 201 });
}
