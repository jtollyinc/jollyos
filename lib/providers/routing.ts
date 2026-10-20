/**
 * lib/providers/routing — the privacy rule, as one pure function.
 * ────────────────────────────────────────────────────────────────────────────
 * Every prompt is built from tagged ContextSegments. The rule:
 *
 *   1. No `local-only` segment      → the default provider gets everything.
 *   2. A `local-only` segment AND a local provider is configured
 *                                   → the LOCAL provider gets everything.
 *   3. A `local-only` segment and NO local provider
 *                                   → the local-only segments are DROPPED
 *                                     (never sent), the default provider gets
 *                                     the rest, and the result says what was
 *                                     left out so the UI can tell the user.
 *
 * "Local" means kind === "local" — an OpenAI-compatible server on hardware you
 * control. The demo provider does not count: it is in-process and harmless,
 * but treating it as local would hide the rule in exactly the mode most people
 * try first. This file has no I/O so the rule is unit-tested in isolation.
 */
import type { ContextSegment, Provider } from "./types";

export interface ProviderSet {
  /** Answers everything that is allowed to leave the machine. */
  default: Provider;
  /** The only provider local-only content may reach; null when unconfigured. */
  local: Provider | null;
  /** Human-readable configuration notes for the Settings page. */
  warnings: string[];
}

export interface RouteDecision {
  provider: Provider;
  /** Segments that will actually be sent. */
  segments: ContextSegment[];
  /** Local-only segments that were withheld (titles are safe to display). */
  dropped: ContextSegment[];
  /** Which rule fired, in plain words. */
  reason: string;
}

export function routeSegments(segments: ContextSegment[], providers: ProviderSet): RouteDecision {
  const localOnly = segments.filter((s) => s.privacy === "local-only");

  if (localOnly.length === 0) {
    return {
      provider: providers.default,
      segments,
      dropped: [],
      reason: `No local-only context; sent to ${providers.default.label}.`,
    };
  }

  if (providers.local) {
    return {
      provider: providers.local,
      segments,
      dropped: [],
      reason: `${localOnly.length} local-only item${localOnly.length === 1 ? "" : "s"} present; routed to the local model.`,
    };
  }

  // Rule 3. If the default happens to be local-kind this branch is unreachable,
  // because providers.local is always set when a local server is configured.
  return {
    provider: providers.default,
    segments: segments.filter((s) => s.privacy !== "local-only"),
    dropped: localOnly,
    reason: `${localOnly.length} local-only item${localOnly.length === 1 ? "" : "s"} withheld: no local model is configured (set LOCAL_LLM_BASE_URL).`,
  };
}

/** Render kept segments as a system-prompt block. */
export function renderSegments(segments: ContextSegment[]): string {
  return segments.map((s) => `## ${s.title}\n${s.text.trim()}`).join("\n\n");
}
