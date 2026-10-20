/**
 * lib/persona/deck — the Decision Deck's pure half.
 * ────────────────────────────────────────────────────────────────────────────
 * A card is a short dilemma with two defensible sides. A swipe records which
 * way you lean and how fast; that is signal a long questionnaire never gets.
 *
 * PRIVACY is derived, not declared: `privacyForCard` is the single gate.
 * Money and people cards are local-only by category; any card whose text
 * touches a private topic is local-only wherever it sits. A card may declare a
 * STRICTER tag but can never loosen the derived one.
 *
 * No I/O here: the store is deck-store.ts, the seed cards are
 * modules/persona/cards.ts. Everything that scores or summarises lives here so
 * a local-only answer never needs a model to become a reveal.
 */
import type { Privacy } from "@/lib/providers/types";

export type DeckCategory = "building" | "tools" | "time" | "money" | "people" | "learning";

export const DECK_CATEGORIES: DeckCategory[] = ["building", "tools", "time", "money", "people", "learning"];

export const CATEGORY_LABEL: Record<DeckCategory, string> = {
  building: "Building",
  tools: "Tools",
  time: "Time",
  money: "Money",
  people: "People",
  learning: "Learning",
};

/** Private by construction: every card here is local-only whatever it says. */
export const PRIVATE_CATEGORIES: ReadonlySet<DeckCategory> = new Set<DeckCategory>(["money", "people"]);

/** Topics that make a card local-only in any category. Broad on purpose. */
export const PRIVATE_TOPIC_RE =
  /\b(health|doctor|therap\w*|medication|meds|sleep|anxiet\w*|salary|income|debt|loan|mortgage|rent|savings|paycheck|partner|spouse|family|kids?|parents?|address|location|relationship)\b/i;

export interface DeckCard {
  id: string;
  category: DeckCategory;
  /** The dilemma, one line. */
  prompt: string;
  /** Left swipe. */
  a: string;
  /** Right swipe. */
  b: string;
  /** Trait slugs per side; cards sharing a pair accumulate into one pattern. */
  traitA: string;
  traitB: string;
  /** May only tighten the derived tag. */
  privacy?: Privacy;
}

export type DeckChoice = "a" | "b" | "depends";

export interface DeckAnswer {
  cardId: string;
  choice: DeckChoice;
  /** Shown → chosen, in ms. */
  ms: number;
  reason?: string;
  category: DeckCategory;
  privacy: Privacy;
  at: string;
}

const RANK: Record<Privacy, number> = { public: 0, "cloud-ok": 1, "local-only": 2 };

export const strictest = (a: Privacy, b: Privacy): Privacy => (RANK[a] >= RANK[b] ? a : b);

/** THE gate. */
export function privacyForCard(card: Pick<DeckCard, "category" | "prompt" | "a" | "b" | "privacy">): Privacy {
  const byCategory: Privacy = PRIVATE_CATEGORIES.has(card.category) ? "local-only" : "cloud-ok";
  const byTopic: Privacy = PRIVATE_TOPIC_RE.test(`${card.prompt} ${card.a} ${card.b}`) ? "local-only" : "cloud-ok";
  const derived = strictest(byCategory, byTopic);
  return card.privacy ? strictest(derived, card.privacy) : derived;
}

export type TaggedCard = DeckCard & { privacy: Privacy };

export const tagCard = (c: DeckCard): TaggedCard => ({ ...c, privacy: privacyForCard(c) });

/** Unanswered cards, interleaved by category so no subject runs ten in a row. */
export function nextCards(cards: TaggedCard[], answers: DeckAnswer[], limit = 40): TaggedCard[] {
  const done = new Set(answers.map((a) => a.cardId));
  const byCat = new Map<DeckCategory, TaggedCard[]>();
  for (const c of cards) {
    if (done.has(c.id)) continue;
    byCat.set(c.category, [...(byCat.get(c.category) ?? []), c]);
  }
  const out: TaggedCard[] = [];
  let added = true;
  while (added && out.length < limit) {
    added = false;
    for (const cat of DECK_CATEGORIES) {
      const list = byCat.get(cat);
      const next = list?.shift();
      if (!next) continue;
      out.push(next);
      added = true;
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** Consecutive days ending today or yesterday with at least one answer. */
export function streakDays(answers: DeckAnswer[], now = new Date()): number {
  const days = new Set(answers.map((a) => a.at.slice(0, 10)));
  if (!days.size) return 0;
  const dayOf = (offset: number) => new Date(now.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
  const start = days.has(dayOf(0)) ? 0 : days.has(dayOf(1)) ? 1 : -1;
  if (start < 0) return 0;
  let n = 0;
  while (days.has(dayOf(start + n))) n++;
  return n;
}

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export const traitKey = (a: string, b: string): string => [a, b].sort().join("|");

export interface TraitTally {
  key: string;
  traits: [string, string];
  counts: Record<string, number>;
  depends: number;
  total: number;
  leader: string | null;
  share: number;
  privacy: Privacy;
}

export function traitOf(card: DeckCard, choice: DeckChoice): string | null {
  if (choice === "a") return card.traitA;
  if (choice === "b") return card.traitB;
  return null;
}

export function tallyTraits(answers: DeckAnswer[], cards: TaggedCard[]): TraitTally[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const tallies = new Map<string, TraitTally>();
  for (const ans of answers) {
    const card = byId.get(ans.cardId);
    if (!card) continue;
    const key = traitKey(card.traitA, card.traitB);
    const t = tallies.get(key) ?? {
      key, traits: [card.traitA, card.traitB].sort() as [string, string],
      counts: {}, depends: 0, total: 0, leader: null, share: 0, privacy: "cloud-ok" as Privacy,
    };
    const trait = traitOf(card, ans.choice);
    if (trait) t.counts[trait] = (t.counts[trait] ?? 0) + 1;
    else t.depends++;
    t.total++;
    t.privacy = strictest(t.privacy, ans.privacy);
    tallies.set(key, t);
  }
  for (const t of tallies.values()) {
    const decided = t.total - t.depends;
    const [top] = Object.entries(t.counts).sort((x, y) => y[1] - x[1]);
    t.leader = decided > 0 && top ? top[0] : null;
    t.share = decided > 0 && top ? top[1] / decided : 0;
  }
  return [...tallies.values()].sort((a, b) => b.total - a.total);
}

export const REVEAL_EVERY = 6;

export interface Reveal {
  lines: string[];
  answered: number;
  medianMs: number;
  usedPrivate: boolean;
}

const pretty = (trait: string) => trait.replace(/-/g, " ");

/** "What this says about you" — only claims the numbers support. */
export function summariseSession(answers: DeckAnswer[], cards: TaggedCard[]): Reveal {
  const medianMs = median(answers.map((a) => a.ms));
  const usedPrivate = answers.some((a) => a.privacy === "local-only");
  if (answers.length < 2) {
    return { lines: ["Too early to say anything true — keep swiping."], answered: answers.length, medianMs, usedPrivate };
  }
  const lines: string[] = [];
  for (const t of tallyTraits(answers, cards)) {
    if (t.total < 2 || !t.leader || t.share < 0.65) continue;
    const other = t.traits.find((x) => x !== t.leader) ?? "the other";
    lines.push(`You take ${pretty(t.leader)} over ${pretty(other)} — ${Math.round(t.share * 100)}% of the time (${t.total} cards).`);
    if (lines.length >= 2) break;
  }
  const depends = answers.filter((a) => a.choice === "depends").length;
  const dShare = depends / answers.length;
  if (dShare >= 0.3) lines.push(`You reject the either/or on ${Math.round(dShare * 100)}% of cards — context is doing the deciding.`);
  else if (depends === 0 && answers.length >= 6) lines.push(`Not one "depends" in ${answers.length} cards. You pick a side.`);
  if (medianMs > 0 && medianMs < 2500) lines.push(`Median ${(medianMs / 1000).toFixed(1)}s a card — these are reflexes, not deliberations.`);
  else if (medianMs >= 6000) lines.push(`Median ${(medianMs / 1000).toFixed(1)}s a card — you are actually weighing these.`);
  if (!lines.length) lines.push("No clear lean yet — your picks are split down the middle.");
  return { lines: lines.slice(0, 4), answered: answers.length, medianMs, usedPrivate };
}
