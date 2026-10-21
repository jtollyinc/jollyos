/**
 * lib/modules/registry — turn manifests into statuses, nav and tiles.
 * ────────────────────────────────────────────────────────────────────────────
 * `computeStatuses` is pure (manifests + env + overrides in, statuses out) so
 * it is unit-tested without a filesystem. `loadStatuses` is the server-side
 * wrapper that reads the Settings toggles from DATA_DIR/modules.json.
 *
 * A module whose required env is missing is NOT hidden: it shows up in the nav
 * with a "needs setup" mark and its page explains what to set. Hiding it would
 * make a half-configured install look like a broken one.
 */
import { isDemoMode, type Env } from "@/lib/config";
import { dataPath, readJson, writeJson } from "@/lib/data-dir";
import { runtimeEnv } from "@/lib/settings/ai";
import { MANIFESTS } from "./manifests";
import type { IconName, ModuleManifest, ModuleOverrides, ModuleState, ModuleStatus } from "./types";

export interface ComputeOptions {
  manifests?: readonly ModuleManifest[];
  env?: Env;
  overrides?: ModuleOverrides;
}

export function computeStatuses(opts: ComputeOptions = {}): ModuleStatus[] {
  const manifests = opts.manifests ?? MANIFESTS;
  const env = opts.env ?? process.env;
  const overrides = opts.overrides ?? { enabled: {} };
  const demo = isDemoMode(env);

  const seen = new Set<string>();
  return manifests.map((manifest) => {
    if (seen.has(manifest.id)) throw new Error(`Duplicate module id: ${manifest.id}`);
    seen.add(manifest.id);

    const enabled = overrides.enabled[manifest.id] ?? manifest.enabledByDefault;
    const waived = demo && manifest.demoWaivesEnv === true;
    const missingEnv = waived ? [] : (manifest.requiredEnv ?? []).filter((name) => !(env[name] ?? "").trim());
    const missingProviders = (manifest.requiredProviders ?? []).filter(
      (p) => p === "local-llm" && !(env.LOCAL_LLM_BASE_URL ?? "").trim(),
    );
    const notes: string[] = [];
    if ((manifest.requiredProviders ?? []).includes("llm") && !hasAnyProvider(env)) {
      notes.push("No model key configured: answers come from the deterministic demo provider.");
    }
    if (waived && (manifest.requiredEnv ?? []).length) notes.push("Demo mode: fixtures stand in for the live configuration.");

    let state: ModuleState = "ready";
    if (!enabled) state = "disabled";
    else if (missingEnv.length || missingProviders.length) state = "needs-setup";

    return { manifest, state, enabled, missingEnv, missingProviders, notes };
  });
}

function hasAnyProvider(env: Env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY || env.LOCAL_LLM_BASE_URL);
}

// ── Server-side: overrides on disk ─────────────────────────────────────────

const overridesFile = () => dataPath("modules.json");

export function readOverrides(): ModuleOverrides {
  const raw = readJson<Partial<ModuleOverrides>>(overridesFile(), {});
  return { enabled: raw.enabled ?? {} };
}

export function setModuleEnabled(id: string, enabled: boolean): ModuleOverrides {
  if (!MANIFESTS.some((m) => m.id === id)) throw new Error(`Unknown module: ${id}`);
  const next = readOverrides();
  next.enabled[id] = enabled;
  writeJson(overridesFile(), next);
  return next;
}

/** `runtimeEnv` so a model configured in the UI counts as configured here too. */
export function loadStatuses(): ModuleStatus[] {
  return computeStatuses({ overrides: readOverrides(), env: runtimeEnv() });
}

export function getModuleStatus(id: string): ModuleStatus | null {
  return loadStatuses().find((s) => s.manifest.id === id) ?? null;
}

// ── Navigation ─────────────────────────────────────────────────────────────

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  state: ModuleState;
  moduleId: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Sidebar groups from enabled modules, in manifest order. */
export function navGroups(statuses: ModuleStatus[]): NavGroup[] {
  const groups: NavGroup[] = [];
  for (const s of statuses) {
    if (!s.enabled) continue;
    const route = s.manifest.routes[0];
    if (!route) continue;
    let group = groups.find((g) => g.label === s.manifest.navGroup);
    if (!group) {
      group = { label: s.manifest.navGroup, items: [] };
      groups.push(group);
    }
    group.items.push({ href: route.href, label: s.manifest.label, icon: s.manifest.icon, state: s.state, moduleId: s.manifest.id });
  }
  return groups;
}

/** Phone bottom bar: Home + up to four quick-tab modules + Settings. */
export function quickTabs(statuses: ModuleStatus[]): NavItem[] {
  const tabs: NavItem[] = [{ href: "/", label: "Home", icon: "home", state: "ready", moduleId: "home" }];
  for (const s of statuses) {
    if (!s.enabled || !s.manifest.quickTab || tabs.length >= 5) continue;
    tabs.push({ href: s.manifest.routes[0].href, label: s.manifest.quickLabel ?? s.manifest.label, icon: s.manifest.icon, state: s.state, moduleId: s.manifest.id });
  }
  tabs.push({ href: "/settings", label: "Settings", icon: "settings", state: "ready", moduleId: "settings" });
  return tabs;
}
