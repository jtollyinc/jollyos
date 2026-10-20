"use client";

/**
 * components/modules/Persona/DecisionDeck — the swipe mode.
 * One card is the whole page. Left = A, right = B, up = depends; buttons and
 * arrow keys do the same. A pick is logged on the gesture and the next card is
 * up immediately; the optional "why" never blocks the deck. Every sixth card a
 * reveal says what the picks support — computed here, no model. A local-only
 * card wears a lock; that tag comes from the server-side gate.
 */
import { ArrowLeft, ArrowRight, ArrowUp, Flame, Lock, MessageSquarePlus, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Card, Chip, EmptyState, Notice, PageHeader, PageShell } from "@/components/jolly/Foundation";
import { CATEGORY_LABEL, summariseSession, type DeckAnswer, type DeckChoice, type Reveal, type TaggedCard } from "@/lib/persona/deck";
import { cn } from "@/lib/utils";
import { PersonaTabs } from "./PersonaTabs";

interface DeckResponse {
  cards: TaggedCard[];
  allCards: TaggedCard[];
  stats: { answered: number; today: number; localOnly: number; cards: number };
  streak: number;
  reveal: Reveal;
  revealEvery: number;
}

const SWIPE_PX = 80;

export function DecisionDeck() {
  const [data, setData] = useState<DeckResponse | null>(null);
  const [queue, setQueue] = useState<TaggedCard[]>([]);
  const [session, setSession] = useState<DeckAnswer[]>([]);
  const [dismissed, setDismissed] = useState(0);
  const [why, setWhy] = useState<{ card: TaggedCard; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const shownAt = useRef(0);
  const origin = useRef<{ x: number; y: number } | null>(null);

  const load = useCallback(
    () =>
      fetch("/api/persona/deck", { cache: "no-store" })
        .then((res) => (res.ok ? (res.json() as Promise<DeckResponse>) : Promise.reject(new Error(String(res.status)))))
        .then((json) => { setData(json); setQueue(json.cards); shownAt.current = Date.now(); })
        .catch(() => setError("Could not load the deck.")),
    [],
  );
  useEffect(() => { void load(); }, [load]);

  const card = queue[0] ?? null;
  useEffect(() => { shownAt.current = Date.now(); }, [card?.id]);

  const cardsById = useMemo(() => new Map((data?.allCards ?? []).map((c) => [c.id, c])), [data]);

  const reveal = useMemo<Reveal | null>(() => {
    const every = data?.revealEvery ?? 6;
    if (!session.length || session.length % every !== 0 || dismissed === session.length) return null;
    return summariseSession(session, session.map((a) => cardsById.get(a.cardId)).filter((c): c is TaggedCard => Boolean(c)));
  }, [session, dismissed, cardsById, data]);

  const pick = useCallback((choice: DeckChoice) => {
    if (!card || reveal) return;
    const ms = Math.max(0, Date.now() - shownAt.current);
    const answer: DeckAnswer = { cardId: card.id, choice, ms, category: card.category, privacy: card.privacy, at: new Date().toISOString() };
    setQueue((q) => q.slice(1));
    setSession((s) => [...s, answer]);
    setWhy({ card, text: "" });
    setError(null);
    void (async () => {
      try {
        const res = await fetch("/api/persona/deck", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardId: card.id, choice, ms }) });
        if (!res.ok) throw new Error(String(res.status));
      } catch {
        setError("That pick did not save — check the connection and swipe it again.");
      }
    })();
  }, [card, reveal]);

  async function saveWhy() {
    if (!why) return;
    const text = why.text.trim();
    setWhy(null);
    if (!text) return;
    await fetch("/api/persona/deck", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardId: why.card.id, choice: session.find((a) => a.cardId === why.card.id)?.choice ?? "depends", ms: 0, reason: text }) });
  }

  // Pointer drag → swipe. Buttons and keys remain for anyone who prefers them.
  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    origin.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!origin.current) return;
    setDrag({ x: e.clientX - origin.current.x, y: e.clientY - origin.current.y });
  }
  function onPointerUp() {
    const d = drag;
    origin.current = null;
    setDrag(null);
    if (!d) return;
    if (d.y < -SWIPE_PX && Math.abs(d.x) < SWIPE_PX) pick("depends");
    else if (d.x <= -SWIPE_PX) pick("a");
    else if (d.x >= SWIPE_PX) pick("b");
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (reveal) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); pick("a"); }
    if (e.key === "ArrowRight") { e.preventDefault(); pick("b"); }
    if (e.key === "ArrowUp") { e.preventDefault(); pick("depends"); }
  }

  const answered = (data?.stats.answered ?? 0) + session.length;
  const streak = Math.max(data?.streak ?? 0, session.length ? 1 : 0);
  const lean = drag ? (drag.y < -SWIPE_PX / 2 && Math.abs(drag.x) < SWIPE_PX / 2 ? "depends" : drag.x < -SWIPE_PX / 2 ? "a" : drag.x > SWIPE_PX / 2 ? "b" : null) : null;

  return (
    <PageShell width="narrow">
      <PageHeader title="Decision Deck" lede="Two defensible sides. Swipe the way you actually lean. Speed counts too.">
        <Chip tone="accent" icon={Flame}>{streak} day streak</Chip>
        <Chip>{answered} / {data?.stats.cards ?? "…"} answered</Chip>
      </PageHeader>
      <PersonaTabs />
      {error ? <Notice tone="danger" className="mb-3">{error}</Notice> : null}

      {reveal ? (
        <Card className="p-5">
          <h2 className="mb-2 flex items-center gap-2 text-base font-semibold"><Sparkles size={16} className="text-accent-soft" aria-hidden="true" />What this says about you</h2>
          <ul className="space-y-2 text-sm leading-relaxed">{reveal.lines.map((l) => <li key={l}>{l}</li>)}</ul>
          <p className="mt-3 text-[12px] text-text-subtle">{reveal.answered} cards this session · median {(reveal.medianMs / 1000).toFixed(1)}s{reveal.usedPrivate ? " · includes local-only answers (computed here, no model)" : ""}</p>
          <button type="button" className="btn-primary mt-4" onClick={() => setDismissed(session.length)}>Keep going</button>
        </Card>
      ) : card ? (
        <div className="space-y-3" onKeyDown={onKeyDown}>
          <div
            role="group"
            aria-label={`Card: ${card.prompt}`}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{ transform: drag ? `translate(${drag.x}px, ${Math.min(0, drag.y)}px) rotate(${drag.x / 24}deg)` : undefined, touchAction: "none" }}
            className={cn("select-none rounded-card border bg-surface p-6 shadow-card transition-transform", lean === "a" && "border-info/60", lean === "b" && "border-accent/60", lean === "depends" && "border-warning/60", !lean && "border-subtle")}
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <Chip tone="neutral">{CATEGORY_LABEL[card.category]}</Chip>
              {card.privacy === "local-only" ? <Chip tone="warning" icon={Lock}>local only</Chip> : null}
            </div>
            <p className="text-xl font-semibold leading-snug lg:text-2xl">{card.prompt}</p>
            <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
              <div className={cn("rounded-control border p-3", lean === "a" ? "border-info/60 bg-info/10" : "border-subtle")}><span className="text-label font-bold uppercase tracking-widest text-text-subtle">← A</span><p className="mt-1 font-medium">{card.a}</p></div>
              <div className={cn("rounded-control border p-3 text-right", lean === "b" ? "border-accent/60 bg-accent/10" : "border-subtle")}><span className="text-label font-bold uppercase tracking-widest text-text-subtle">B →</span><p className="mt-1 font-medium">{card.b}</p></div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button type="button" className="btn-ghost" onClick={() => pick("a")}><ArrowLeft size={16} aria-hidden="true" />{card.a}</button>
            <button type="button" className="btn-ghost" onClick={() => pick("depends")}><ArrowUp size={16} aria-hidden="true" />Depends</button>
            <button type="button" className="btn-ghost" onClick={() => pick("b")}>{card.b}<ArrowRight size={16} aria-hidden="true" /></button>
          </div>
          {why ? (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void saveWhy(); }}>
              <input className="field" value={why.text} onChange={(e) => setWhy({ ...why, text: e.target.value })} placeholder={`Why, in one line? (optional) — "${why.card.prompt}"`} maxLength={280} aria-label="Why" />
              <button type="submit" className="btn-ghost shrink-0"><MessageSquarePlus size={16} aria-hidden="true" />Save</button>
            </form>
          ) : null}
          <p className="text-center text-[12px] text-text-subtle">Drag the card, tap a side, or use ← → ↑.</p>
        </div>
      ) : data ? (
        <EmptyState title="Deck complete">You have answered every card. Add more in modules/persona/cards.ts, or come back when a new one lands.</EmptyState>
      ) : (
        <div className="h-64 animate-pulse rounded-card bg-surface" />
      )}

      {data && session.length === 0 && data.reveal.answered >= 2 ? (
        <Card className="mt-4 p-4">
          <h2 className="mb-1 text-label font-bold uppercase tracking-widest text-text-subtle">So far</h2>
          <ul className="space-y-1 text-sm text-text-muted">{data.reveal.lines.map((l) => <li key={l}>{l}</li>)}</ul>
        </Card>
      ) : null}
    </PageShell>
  );
}
