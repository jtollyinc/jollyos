/**
 * lib/modules/types — what a module declares about itself.
 * ────────────────────────────────────────────────────────────────────────────
 * A module is a folder under modules/<id>/ whose module.ts exports a
 * ModuleManifest. The registry (lib/modules/registry.ts) reads every manifest
 * and derives the navigation, the home tiles and a status per module:
 *
 *   ready        everything it needs is configured
 *   needs-setup  enabled, but a required env var / provider is missing — the
 *                page renders a setup card instead of crashing
 *   disabled     turned off (manifest default or the Settings toggle)
 *
 * Manifests must stay client-safe: plain data, icon by NAME (see
 * components/jolly/icons.tsx), no fs, no secrets. docs/modules.md explains
 * how to write one.
 */

export type IconName =
  | "home" | "bot" | "newspaper" | "user" | "sparkles" | "settings"
  | "list-checks" | "mic" | "brain" | "layers";

/** Shared topic accents from globals.css ([data-topic-accent]). */
export type TopicAccent = "today" | "jobs" | "news" | "you" | "decisions";

export type RequiredProvider = "llm" | "local-llm";

export interface ModuleRoute {
  href: string;
  label: string;
}

export interface ModuleManifest {
  /** Stable id; also the folder name and the route prefix. */
  id: string;
  label: string;
  /** One line for the home tile. */
  description: string;
  icon: IconName;
  /** Sidebar group heading, e.g. "Do", "Read", "You". */
  navGroup: string;
  /** First route is the module's landing page. */
  routes: ModuleRoute[];
  /** Env vars the module cannot work without. */
  requiredEnv?: string[];
  /** When true, demo mode satisfies requiredEnv (fixtures replace the config). */
  demoWaivesEnv?: boolean;
  /**
   * "llm" is advisory (the demo provider always exists, so it never blocks);
   * "local-llm" blocks until LOCAL_LLM_BASE_URL is set.
   */
  requiredProviders?: RequiredProvider[];
  enabledByDefault: boolean;
  /** Show in the phone bottom bar (max 4 modules). */
  quickTab?: boolean;
  accent?: TopicAccent;
}

export type ModuleState = "ready" | "needs-setup" | "disabled";

export interface ModuleStatus {
  manifest: ModuleManifest;
  state: ModuleState;
  enabled: boolean;
  missingEnv: string[];
  missingProviders: RequiredProvider[];
  /** Advisory lines ("running on the demo provider"). */
  notes: string[];
}

/** DATA_DIR/modules.json — the Settings page toggles. */
export interface ModuleOverrides {
  enabled: Record<string, boolean>;
}
