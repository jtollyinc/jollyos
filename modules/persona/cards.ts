/**
 * modules/persona/cards — the starter Decision Deck.
 * ────────────────────────────────────────────────────────────────────────────
 * Twelve generic dilemmas with two defensible sides each. No trick questions:
 * the signal is which way you lean and how fast, so a card with an obviously
 * right answer teaches nothing. Privacy is DERIVED by lib/persona/deck.ts
 * (money and people are local-only by category) — nothing here declares it.
 *
 * Cards are code, not data, so a fresh install always has a deck. Add your own
 * here or extend the module to load extra cards from DATA_DIR.
 */
import type { DeckCard } from "@/lib/persona/deck";

type Seed = Omit<DeckCard, "id">;

const seeds: Seed[] = [
  // Building
  { category: "building", prompt: "The feature works but the UI is rough.", a: "Ship it today", traitA: "speed", b: "Polish it first", traitB: "polish" },
  { category: "building", prompt: "A library does 80% of what you need.", a: "Use the library", traitA: "buy", b: "Build your own", traitB: "build" },
  { category: "building", prompt: "A one-line hack fixes it; the real fix is a day.", a: "Hack now, fix later", traitA: "speed", b: "Do the real fix", traitB: "polish" },
  // Tools
  { category: "tools", prompt: "The free tier is annoying; the paid plan removes the friction.", a: "Stay on free", traitA: "frugal", b: "Pay for it", traitB: "convenience" },
  { category: "tools", prompt: "A new tool is better, but you know the old one cold.", a: "Keep the one you know", traitA: "proven", b: "Switch to the new one", traitB: "new" },
  // Time
  { category: "time", prompt: "A free Saturday: the side project, or the thing that is overdue.", a: "Side project", traitA: "play", b: "The overdue thing", traitB: "duty" },
  { category: "time", prompt: "A task you could do in 20 minutes, or delegate with a 20-minute handoff.", a: "Just do it", traitA: "solo", b: "Hand it off", traitB: "delegate" },
  { category: "time", prompt: "Two hours left in the day.", a: "Finish the half-done thing", traitA: "finish", b: "Start the exciting one", traitB: "start" },
  // Money (local-only by category)
  { category: "money", prompt: "A tool you use daily raises its price by 40%.", a: "Renew anyway", traitA: "convenience", b: "Find an alternative", traitB: "frugal" },
  { category: "money", prompt: "Buy the good version once, or the cheap one now.", a: "Cheap one now", traitA: "frugal", b: "Good one once", traitB: "quality" },
  // People (local-only by category)
  { category: "people", prompt: "A friend asks for help the evening you planned to rest.", a: "Help tonight", traitA: "others", b: "Offer tomorrow", traitB: "self" },
  // Learning
  { category: "learning", prompt: "Learn the fundamentals first, or build and look things up as you go.", a: "Fundamentals first", traitA: "depth", b: "Build and look up", traitB: "momentum" },
];

export const SEED_CARDS: DeckCard[] = seeds.map((s, i) => ({ ...s, id: `seed-${String(i + 1).padStart(2, "0")}` }));
