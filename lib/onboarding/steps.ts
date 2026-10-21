/**
 * lib/onboarding/steps — the eight screens, in order. Client-safe plain data.
 * ────────────────────────────────────────────────────────────────────────────
 * One idea per screen (docs/design-system.md rule 8). The ids are stable: they
 * are the resume key in DATA_DIR/walkthrough.json and the screenshot names in
 * docs/screenshots. Adding a screen means adding a row here and a case in
 * components/modules/Welcome/WalkthroughSteps.tsx.
 */

export interface WalkthroughStep {
  id: string;
  /** The heading on the screen. */
  title: string;
  /** One line under it. Plain words, no jargon. */
  lede: string;
}

export const STEPS: readonly WalkthroughStep[] = [
  { id: "what", title: "What JollyOS is", lede: "Three things. That is the whole app." },
  { id: "about", title: "About you", lede: "So it can talk to you, not at you." },
  { id: "goals", title: "What you are working towards", lede: "One or two. Be specific — vague goals cannot be checked." },
  { id: "interests", title: "What you follow", lede: "Tap what you are into. This fills your Daily Brief." },
  { id: "style", title: "How you like information", lede: "Length, tone, and when your morning starts." },
  { id: "privacy", title: "What stays on this machine", lede: "Leave all four on if you are not sure." },
  { id: "brain", title: "The AI brain", lede: "Optional. JollyOS works with no model at all." },
  { id: "finish", title: "You are set up", lede: "Here is what got configured." },
] as const;

export const FIRST_STEP = STEPS[0].id;
export const LAST_STEP = STEPS[STEPS.length - 1].id;

export function stepIndex(id: string): number {
  const i = STEPS.findIndex((s) => s.id === id);
  return i < 0 ? 0 : i;
}

export function isStepId(id: unknown): boolean {
  return typeof id === "string" && STEPS.some((s) => s.id === id);
}

export const stepAt = (i: number): WalkthroughStep => STEPS[Math.min(Math.max(i, 0), STEPS.length - 1)];
