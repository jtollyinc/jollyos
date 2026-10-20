/**
 * lib/config — the one place that reads process.env.
 * ────────────────────────────────────────────────────────────────────────────
 * Why: every other module asks this file instead of touching the environment,
 * so a test can pass a fake env and the docs can list every variable in one
 * table (README "Configuration"). Secret VALUES never leave this module as
 * anything but "set / not set" booleans, except to the provider that needs them.
 */

export type Env = Record<string, string | undefined>;

const TRUE = new Set(["1", "true", "yes", "on"]);

/** DEMO_MODE=true: fictional seeded data, auto-login, no setup page. */
export function isDemoMode(env: Env = process.env): boolean {
  return TRUE.has((env.DEMO_MODE ?? "").trim().toLowerCase());
}

/** Comma-separated BRIEF_FEEDS → trimmed, non-empty URLs. */
export function briefFeeds(env: Env = process.env): string[] {
  return (env.BRIEF_FEEDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * The runner "Auto" means: JOBS_DEFAULT_RUNNER when set to a known id; else
 * demo in demo mode; else the first runner with its configuration present
 * (api → local); else demo. Pure, so the rule is unit-tested with a fake env.
 */
export function defaultRunner(env: Env = process.env): "demo" | "api" | "cli" | "local" {
  const wanted = (env.JOBS_DEFAULT_RUNNER ?? "").trim().toLowerCase();
  if (wanted === "demo" || wanted === "api" || wanted === "cli" || wanted === "local") return wanted;
  if (isDemoMode(env)) return "demo";
  if (env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY) return "api";
  if (env.LOCAL_LLM_BASE_URL) return "local";
  return "demo";
}

/** Non-secret overview for the Settings page and the health endpoint. */
export function configSummary(env: Env = process.env) {
  return {
    demoMode: isDemoMode(env),
    dataDir: env.DATA_DIR || "./data",
    authSecret: env.AUTH_SECRET ? "env" : "generated",
    llmProvider: env.LLM_PROVIDER || "auto",
    anthropic: { keySet: Boolean(env.ANTHROPIC_API_KEY), model: env.ANTHROPIC_MODEL || null },
    openai: { keySet: Boolean(env.OPENAI_API_KEY), model: env.OPENAI_MODEL || null },
    local: { baseUrl: env.LOCAL_LLM_BASE_URL || null, model: env.LOCAL_LLM_MODEL || null },
    jobs: { defaultRunner: defaultRunner(env), cliCwd: env.JOBS_CLI_CWD || null },
    briefFeeds: briefFeeds(env).length,
  };
}
