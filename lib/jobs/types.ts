/**
 * lib/jobs/types — the Jobs board's shapes, the runner manifests and the one
 * routing rule. Client-safe (no fs, no env): the board UI imports from here,
 * the store and the runners import from here, and nothing here touches disk.
 * ────────────────────────────────────────────────────────────────────────────
 * A RUNNER is who executes a whole job. Picking one is ONE control with ONE
 * rule — no classifier, no scoring:
 *
 *   Auto    → the configured default runner (JOBS_DEFAULT_RUNNER; demo in
 *             demo mode; else the first configured of api → local → demo)
 *   private → the LOCAL runner, whatever was picked, and never a cloud model.
 *             No local server configured or reachable → the job is BLOCKED
 *             with the reason, never sent anywhere else.
 *
 * A job is private when its brief carries a `PRIVACY: local-only` line — the
 * same tag the persona entries use for things that never leave your machine.
 * The lock on the new-job sheet writes that line.
 *
 * Which MODEL answers inside a runner stays with lib/providers (the privacy
 * router and the per-provider adapters); runners reuse it, never duplicate it.
 */

export type JobLane = "inbox" | "running" | "done" | "failed" | "blocked";
export type RunnerId = "demo" | "api" | "cli" | "local";
export type RunnerChoice = "auto" | RunnerId;
export type RunnerKind = "cloud" | "local" | "cli" | "demo";

export interface JobLogLine {
  at: string;
  line: string;
}

export interface Job {
  id: string;
  title: string;
  brief: string;
  lane: JobLane;
  runner: RunnerId | null;
  /** The private rule: local only, never a cloud model. Derived from the brief's tag. */
  private: boolean;
  /** Why it sits in Blocked (local runner unreachable / not configured). */
  blockedReason: string | null;
  /** The goal this job serves, when it serves one. A finished linked job is
   *  evidence in that goal's reality check (lib/goals/reality). */
  goalId?: string | null;
  /** The model or CLI that answered, when known ("claude-sonnet-5", "codex 0.162"). */
  model: string | null;
  /** 0-100 */
  progress: number;
  output: string | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  /** Demo runner: how long the simulated run takes. */
  simulatedMs?: number;
  log: JobLogLine[];
}

export const LANES: { id: JobLane; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "running", label: "Running" },
  { id: "blocked", label: "Blocked" },
  { id: "done", label: "Done" },
  { id: "failed", label: "Failed" },
];

export function jobCounts(jobs: Job[]): Record<JobLane, number> {
  const by: Record<JobLane, number> = { inbox: 0, running: 0, done: 0, failed: 0, blocked: 0 };
  for (const j of jobs) by[j.lane]++;
  return by;
}

// ── runner manifests ────────────────────────────────────────────────────────

export interface RunnerManifest {
  id: RunnerId;
  /** Picker label, short enough for a phone. */
  label: string;
  kind: RunnerKind;
  cost: { model: "free" | "subscription" | "metered"; hint: string };
  capabilities: { agentic: boolean; promptOnly: boolean };
  /** Env var NAMES (any one of them) that make the runner usable. Values are never read here. */
  requiredEnv: string[];
  description: string;
  limits?: string;
}

export const LOCAL_RUNNER: RunnerId = "local";

/** One entry per lib/jobs/runners/<id>.ts. Order = picker order. */
export const RUNNER_MANIFESTS: readonly RunnerManifest[] = [
  {
    id: "api", label: "API", kind: "cloud",
    cost: { model: "metered", hint: "API credits" },
    capabilities: { agentic: false, promptOnly: true },
    requiredEnv: ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"],
    description: "Sends the brief to your API provider (Anthropic or OpenAI), persona-aware and privacy-routed.",
    limits: "Prompt in, text out. Shows “needs setup” until a key is set.",
  },
  {
    id: "cli", label: "CLI", kind: "cli",
    cost: { model: "subscription", hint: "your CLI plan" },
    capabilities: { agentic: true, promptOnly: false },
    requiredEnv: [],
    description: "Runs the brief through an agent CLI found on this machine (Codex or Claude Code) — it can read and edit files in JOBS_CLI_CWD.",
    limits: "Needs `codex` or `claude` installed and signed in; shows “needs setup” otherwise.",
  },
  {
    id: "local", label: "Local", kind: "local",
    cost: { model: "free", hint: "$0 · your own server" },
    capabilities: { agentic: false, promptOnly: true },
    requiredEnv: ["LOCAL_LLM_BASE_URL"],
    description: "Prompt → result on your OpenAI-compatible local server (LM Studio, Ollama, llama.cpp). The only runner a private job may use.",
    limits: "No tools. Unreachable → the job is Blocked, never sent to a cloud model.",
  },
  {
    id: "demo", label: "Demo", kind: "demo",
    cost: { model: "free", hint: "$0 · no model" },
    capabilities: { agentic: false, promptOnly: true },
    requiredEnv: [],
    description: "Simulates a short run with a deterministic answer. No model, no network.",
  },
];

export const RUNNER_IDS: readonly RunnerId[] = RUNNER_MANIFESTS.map((m) => m.id);

export function isRunnerId(v: unknown): v is RunnerId {
  return typeof v === "string" && (RUNNER_IDS as readonly string[]).includes(v);
}
export function isRunnerChoice(v: unknown): v is RunnerChoice {
  return v === "auto" || isRunnerId(v);
}
export function runnerManifest(id: string | null | undefined): RunnerManifest | null {
  return RUNNER_MANIFESTS.find((m) => m.id === id) ?? null;
}
export function runnerIsCloud(id: RunnerId): boolean {
  return runnerManifest(id)?.kind === "cloud";
}

// ── the private tag ─────────────────────────────────────────────────────────

export const PRIVATE_TAG_RX = /^\s*(PRIVACY|PRIVATE)\s*:\s*(local-only|local|true|yes)\s*$/im;
export const PRIVATE_TAG_LINE = "PRIVACY: local-only";

export function briefIsPrivate(text: string | null | undefined): boolean {
  return !!text && PRIVATE_TAG_RX.test(text);
}
/** The text with the tag as its first line (idempotent). */
export function tagPrivate(text: string): string {
  return briefIsPrivate(text) ? text : `${PRIVATE_TAG_LINE}\n${text.replace(/^\s+/, "")}`;
}
/** The brief without its tag line — what the card shows. */
export function stripPrivateTag(text: string): string {
  return text.split("\n").filter((l) => !PRIVATE_TAG_RX.test(l)).join("\n").trim();
}

// ── the one rule ────────────────────────────────────────────────────────────

export interface RunnerResolution {
  runner: RunnerId;
  /** True when the private rule overrode the choice (or Auto). */
  forced: boolean;
  why: string;
}

export function resolveRunner(choice: RunnerChoice | null | undefined, opts: { private: boolean; defaultRunner: RunnerId }): RunnerResolution {
  const picked: RunnerChoice = isRunnerChoice(choice) ? choice : "auto";
  if (opts.private) {
    const forced = picked !== LOCAL_RUNNER;
    return {
      runner: LOCAL_RUNNER, forced,
      why: forced
        ? `Private job → Local only (${picked === "auto" ? "Auto" : runnerManifest(picked)?.label ?? picked} not used; never a cloud model)`
        : "Private job → Local only (never a cloud model)",
    };
  }
  if (picked === "auto") return { runner: opts.defaultRunner, forced: false, why: `Auto → ${runnerManifest(opts.defaultRunner)?.label ?? opts.defaultRunner} (the default runner)` };
  return { runner: picked, forced: false, why: `${runnerManifest(picked)?.label ?? picked} (picked by hand)` };
}

/** The cost a card shows: a local or demo job is always $0; the rest name the plan. */
export function costLabel(runner: RunnerId | null | undefined): string | null {
  const m = runnerManifest(runner);
  if (!m) return null;
  return m.cost.model === "free" ? "$0" : m.cost.hint;
}

// ── registry validation (pure; the tests and the server both run it) ────────

export function validateRegistry(manifests: readonly RunnerManifest[] = RUNNER_MANIFESTS): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const m of manifests) {
    if (!/^[a-z][a-z0-9-]{1,30}$/.test(m.id)) problems.push(`${m.id}: id must be lowercase-kebab`);
    if (seen.has(m.id)) problems.push(`${m.id}: duplicate id`);
    seen.add(m.id);
    if (!m.label.trim() || m.label.length > 12) problems.push(`${m.id}: label missing or longer than 12 chars`);
    if (!["cloud", "local", "cli", "demo"].includes(m.kind)) problems.push(`${m.id}: bad kind ${m.kind}`);
    if (!["free", "subscription", "metered"].includes(m.cost.model) || !m.cost.hint.trim()) problems.push(`${m.id}: cost needs a model and a hint`);
    if ((m.kind === "local" || m.kind === "demo") && m.cost.model !== "free") problems.push(`${m.id}: a ${m.kind} runner must be free`);
    if (m.capabilities.agentic === m.capabilities.promptOnly) problems.push(`${m.id}: exactly one of agentic / promptOnly`);
    if (!m.description.trim()) problems.push(`${m.id}: description missing`);
    if (m.requiredEnv.some((e) => !/^[A-Z][A-Z0-9_]+$/.test(e))) problems.push(`${m.id}: requiredEnv must be env var NAMES`);
  }
  const local = manifests.find((m) => m.id === LOCAL_RUNNER);
  if (!local) problems.push(`local runner ${LOCAL_RUNNER} is not registered`);
  else if (local.kind !== "local") problems.push(`${LOCAL_RUNNER}: the private rule's runner must be kind local`);
  if (!seen.has("demo")) problems.push("the demo runner is not registered (demo mode needs it)");
  return problems;
}
