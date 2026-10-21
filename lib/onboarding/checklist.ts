/**
 * lib/onboarding/checklist — the "Getting started" list on Home.
 * ────────────────────────────────────────────────────────────────────────────
 * Pure and client-safe: real counts in, items out. Nothing here is a stored
 * "task done" flag — every item is derived from state that already exists, so
 * the list cannot lie or rot (docs/design-system.md: nothing rots or shames).
 * The only persisted bit is whether the owner dismissed the card
 * (walkthrough.json `checklistDismissedAt`).
 */

export interface ChecklistInput {
  walkthroughFinished: boolean;
  jobs: number;
  briefBuilt: boolean;
  deckAnswers: number;
  imports: number;
  goals: number;
  checkIns: number;
}

export interface ChecklistItem {
  id: string;
  label: string;
  /** One short line: why it is worth doing. */
  hint: string;
  href: string;
  cta: string;
  done: boolean;
}

export const DECK_TARGET = 5;

/** Undone items first, in a sensible order; done ones keep their place behind them. */
export function checklistItems(input: ChecklistInput): ChecklistItem[] {
  const items: ChecklistItem[] = [
    { id: "walkthrough", label: "Finish the welcome walkthrough", hint: "Five minutes, and the app knows what you are into.", href: "/welcome", cta: "Open", done: input.walkthroughFinished },
    { id: "goal", label: "Set your first goal", hint: "What you actually want, and the hours you can really give it.", href: "/goals/new", cta: "Set", done: input.goals > 0 },
    { id: "checkin", label: "Do your first check-in", hint: "Two minutes. It is what makes the Coach honest.", href: "/goals", cta: "Open", done: input.checkIns > 0 },
    { id: "brief", label: "Read today's Daily Brief", hint: "Your feeds, summarised for you.", href: "/brief", cta: "Open", done: input.briefBuilt },
    { id: "job", label: "Capture your first job", hint: "Type a thought; it becomes a card you can hand to a model.", href: "/jobs", cta: "Open", done: input.jobs > 0 },
    { id: "deck", label: `Swipe ${DECK_TARGET} Decision Deck cards`, hint: "Each swipe teaches it how you actually decide.", href: "/persona/deck", cta: "Swipe", done: input.deckAnswers >= DECK_TARGET },
    { id: "import", label: "Import what ChatGPT already knows", hint: "Optional. Nothing enters your persona until you approve it.", href: "/persona/import", cta: "Open", done: input.imports > 0 },
  ];
  return [...items.filter((i) => !i.done), ...items.filter((i) => i.done)];
}

export function checklistProgress(items: ChecklistItem[]): { done: number; total: number; complete: boolean } {
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, complete: done === items.length };
}
