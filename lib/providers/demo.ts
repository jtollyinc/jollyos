/**
 * lib/providers/demo — a deterministic, in-process "model".
 * ────────────────────────────────────────────────────────────────────────────
 * Used whenever no provider key is configured (and always in demo mode when
 * LLM_PROVIDER is unset). It never touches the network. The output is shaped
 * by the request `kind` and seeded from a hash of the prompt, so the same input
 * always gives the same answer and screenshots are reproducible.
 *
 * It is honest about what it is: every answer ends with a "demo provider" note.
 */
import { hashString } from "@/lib/utils";
import type { CompletionRequest, CompletionResult, Provider } from "./types";

const NOTE = "\n\n_(Deterministic demo provider — configure a real model in .env to get actual answers.)_";

/** Bullet lines ("- ...") from a block of text. */
function bullets(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2).trim())
    .filter(Boolean);
}

function pick<T>(items: T[], seed: number, offset = 0): T {
  return items[(seed + offset) % items.length];
}

function askAnswer(req: CompletionRequest, seed: number): string {
  const persona = bullets(req.system);
  const lead = pick([
    "Here is how I would actually call this.",
    "Short version first, then why.",
    "Taking this the way I usually do:",
  ], seed);
  const lines = [lead, ""];
  if (persona.length) {
    const a = pick(persona, seed, 1);
    const b = pick(persona, seed, 3);
    lines.push(`The rule that applies most is: "${a}"`);
    if (b !== a) lines.push(`And I keep coming back to: "${b}"`);
    lines.push("");
  }
  lines.push(
    pick([
      "Weighing that against the question, the reversible option wins: try it for a week, keep notes, and only commit once the notes say it earned its place.",
      "So the answer is the smaller step: do the version that takes an afternoon, ship it, and revisit only if it keeps coming up.",
      "That points at waiting: the cost of deciding later is low here, and more information arrives on its own.",
    ], seed, 5),
  );
  lines.push("");
  lines.push(`**Recommendation:** ${pick([
    "go with the simpler option and set a date to review it.",
    "try it, time-boxed, before paying for anything.",
    "say no for now; revisit when it costs you a second time.",
  ], seed, 7)}`);
  return lines.join("\n");
}

function briefSummary(req: CompletionRequest, seed: number): string {
  const items = bullets(req.prompt);
  if (!items.length) return "Nothing new in this section today.";
  const top = items.slice(0, 3);
  const openers = ["The thread today:", "What matters here:", "Three things worth a look:"];
  return [pick(openers, seed), ...top.map((t) => `- ${t.split(" — ")[0].slice(0, 110)}`)].join("\n");
}

function jobOutput(req: CompletionRequest, seed: number): string {
  const task = req.prompt.trim().split("\n")[0]?.slice(0, 120) || "the task";
  return [
    `Worked through: ${task}`,
    "",
    "- Clarified what done looks like",
    `- ${pick(["Drafted a first version", "Listed the three concrete steps", "Found the one blocker and named it"], seed)}`,
    `- ${pick(["Left a note on what to check next", "Flagged one open question for you", "Wrote the follow-up as its own card"], seed, 2)}`,
  ].join("\n");
}

export function demoProvider(): Provider {
  return {
    id: "demo",
    label: "Demo provider",
    kind: "demo",
    model: "deterministic",
    async complete(req: CompletionRequest): Promise<CompletionResult> {
      const seed = hashString(`${req.system ?? ""}\n${req.prompt}`);
      let text: string;
      switch (req.kind) {
        case "ask":
          text = askAnswer(req, seed);
          break;
        case "brief":
          text = briefSummary(req, seed);
          break;
        case "job":
          text = jobOutput(req, seed);
          break;
        default:
          text = `Echo (${req.prompt.length} chars): ${req.prompt.slice(0, 200)}`;
      }
      return { text: text + NOTE, provider: "demo", model: "deterministic" };
    },
  };
}
