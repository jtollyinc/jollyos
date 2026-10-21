/**
 * lib/goals/coach — the words the Coach shows. SERVER-SIDE ONLY.
 * ────────────────────────────────────────────────────────────────────────────
 * The VERDICT is never a model's opinion. lib/goals/reality decides it from
 * the numbers; a model, if one is configured at all, may only rewrite the
 * wording. With no model the page is complete and says the same thing — the
 * rules text is the product, not a fallback.
 *
 * Privacy is enforced by choosing the provider, not by filtering a prompt:
 *   local-only goal  → the LOCAL provider, or no model at all. Never a hosted
 *                      one, and never "withheld but still sent".
 *   cloud-ok goal    → the ordinary router (lib/providers), persona attached.
 * The deterministic demo provider is deliberately not used for a rewrite: its
 * output is a fixture, and a fixture pretending to be coaching is worse than
 * the honest rule text.
 */
import { completeWithContext, type ProviderSet } from "@/lib/providers";
import { realityCheck, type RealityCheck, type RealityInput } from "./reality";
import { areaById, type CheckIn, type Goal } from "./types";

export interface CoachedCheck extends RealityCheck {
  /** Where the wording came from. */
  voice: "rules" | "model";
  provider: string | null;
  /** What to render. Identical to `headline`/`adjustment.line` when voice is "rules". */
  headlineText: string;
  adjustmentText: string;
  /** Set when a model was asked and could not answer. */
  note: string | null;
}

const INSTRUCTIONS =
  "You are rewriting one short reality check for somebody's personal goal. You are kind but blunt and you never flatter. " +
  "Keep every number exactly as given — they are measured facts, not estimates. Do not add new advice, do not add encouragement, " +
  "do not use exclamation marks. Reply with exactly two lines:\n" +
  "VERDICT: <one sentence naming the gap, with the numbers>\n" +
  "ADJUST: <one concrete thing to do this week>";

function rulesOnly(check: RealityCheck, note: string | null = null): CoachedCheck {
  return { ...check, voice: "rules", provider: null, headlineText: check.headline, adjustmentText: check.adjustment.line, note };
}

/** Parse the two-line reply; anything unexpected falls back to the rules text. */
function parse(text: string): { headline: string; adjust: string } | null {
  const headline = /^VERDICT:\s*(.+)$/im.exec(text)?.[1]?.trim();
  const adjust = /^ADJUST:\s*(.+)$/im.exec(text)?.[1]?.trim();
  if (!headline || !adjust) return null;
  return { headline: headline.slice(0, 400), adjust: adjust.slice(0, 400) };
}

export interface CoachOptions extends RealityInput {
  providers: ProviderSet;
  /** Skip the model even when one is configured (the page's "plain" toggle, tests). */
  rulesOnly?: boolean;
}

export async function coachGoal(opts: CoachOptions): Promise<CoachedCheck> {
  const check = realityCheck(opts);
  const { goal, providers } = opts;
  if (opts.rulesOnly) return rulesOnly(check);

  // The privacy decision, made once, by picking who may be asked.
  const provider = goal.privacy === "local-only" ? providers.local : providers.default;
  if (!provider || provider.kind === "demo") {
    return rulesOnly(check, goal.privacy === "local-only" && !providers.local
      ? "This goal is local-only, so it is never sent to a hosted model. Point JollyOS at a model on this machine to have the wording rewritten."
      : null);
  }

  const area = areaById(goal.area)?.label ?? goal.area;
  const body = [
    `Area: ${area}`,
    `Weeks running: ${check.stats.weeks}`,
    `VERDICT: ${check.headline}`,
    `ADJUST: ${check.adjustment.line}`,
    "Facts:",
    ...check.facts.map((f) => `- ${f}`),
  ].join("\n");

  try {
    if (goal.privacy === "local-only") {
      // Straight to the local model: the router exists to keep this content
      // away from a hosted provider, and here there is no hosted provider in
      // play at all.
      const r = await provider.complete({ system: `${INSTRUCTIONS}\n\nThe goal: ${goal.want}\nWhy it matters: ${goal.why}`, prompt: body, kind: "generic", maxTokens: 300 });
      const parsed = parse(r.text);
      return parsed
        ? { ...check, voice: "model", provider: provider.label, headlineText: parsed.headline, adjustmentText: parsed.adjust, note: null }
        : rulesOnly(check);
    }
    const r = await completeWithContext(
      {
        instructions: INSTRUCTIONS,
        segments: [
          { title: "goal", text: `- ${goal.want}`, privacy: goal.privacy },
          { title: "why it matters", text: `- ${goal.why}`, privacy: goal.privacy },
        ],
        prompt: body,
        kind: "generic",
        maxTokens: 300,
      },
      providers,
    );
    const parsed = parse(r.text);
    return parsed
      ? { ...check, voice: "model", provider: r.route.provider.label, headlineText: parsed.headline, adjustmentText: parsed.adjust, note: null }
      : rulesOnly(check);
  } catch (err) {
    return rulesOnly(check, `The model could not be reached (${err instanceof Error ? err.message : "unknown"}), so this is the plain version.`);
  }
}

/** Every goal, coached, in parallel. */
export async function coachAll(goals: Goal[], checkIns: CheckIn[], providers: ProviderSet, jobsDoneByGoal: Record<string, number> = {}, rulesOnlyMode = false): Promise<CoachedCheck[]> {
  return Promise.all(goals.map((goal) => coachGoal({ goal, checkIns, providers, jobsDone: jobsDoneByGoal[goal.id] ?? 0, rulesOnly: rulesOnlyMode })));
}
