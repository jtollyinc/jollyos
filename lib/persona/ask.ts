/**
 * lib/persona/ask — "Ask Myself": answer a question the way the owner would.
 * ────────────────────────────────────────────────────────────────────────────
 * Builds tagged context from the persona store plus recent Decision Deck
 * answers, then hands it to the provider router. The router may withhold
 * local-only items (no local model configured); the result carries that
 * decision so the UI can say exactly what was and was not used.
 * SERVER-SIDE ONLY.
 */
import { completeWithContext, type ContextSegment, type ProviderSet } from "@/lib/providers";
import { allCards, readAnswers } from "./deck-store";
import { personaSegments, readEntries } from "./store";

const INSTRUCTIONS = [
  "You are answering AS the person described in the context below — not as an assistant advising them.",
  "Use their stated values, rules and past calls. Be direct and decisive; they value their time.",
  "Do not hedge with generic advice. Keep it tight: a short reasoning paragraph, then a bolded recommendation.",
  "If the context genuinely does not cover the question, say so in one line and give your best call anyway.",
].join("\n");

/** Recent deck answers as tagged example segments (the card's privacy applies). */
export function decisionSegments(limit = 12): ContextSegment[] {
  const cards = new Map(allCards().map((c) => [c.id, c]));
  return readAnswers({ includePrivate: true })
    .slice(-limit)
    .flatMap((a) => {
      const card = cards.get(a.cardId);
      if (!card) return [];
      const pick = a.choice === "depends" ? "it depends" : a.choice === "a" ? card.a : card.b;
      const why = a.reason ? ` Why: ${a.reason}` : "";
      return [{ title: "past decision", text: `- ${card.prompt} → ${pick}.${why}`, privacy: a.privacy }];
    });
}

export interface AskResult {
  answer: string;
  provider: string;
  model: string;
  used: number;
  withheld: number;
  withheldTitles: string[];
  reason: string;
}

export async function askMyself(question: string, providers?: ProviderSet): Promise<AskResult> {
  const segments = [...personaSegments(readEntries()), ...decisionSegments()];
  const result = await completeWithContext(
    { instructions: INSTRUCTIONS, segments, prompt: `THE DECISION: ${question.trim()}`, kind: "ask", maxTokens: 2000 },
    providers,
  );
  return {
    answer: result.text,
    provider: result.route.provider.label,
    model: result.model,
    used: result.route.segments.length,
    withheld: result.route.dropped.length,
    withheldTitles: result.route.dropped.map((d) => d.title),
    reason: result.route.reason,
  };
}
