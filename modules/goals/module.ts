import type { ModuleManifest } from "@/lib/modules/types";

/**
 * Goals & Coach: the spine. A goal states what you want, where you actually
 * are and what you can really give it; a weekly check-in records the same
 * shape again; the Coach reads the gap between them and says it out loud.
 *
 * No requiredEnv and no requiredProviders: the reality check is rule-based
 * arithmetic (lib/goals/reality), so this module is fully useful with no model
 * configured at all. A model only rewrites the wording.
 */
export const goalsModule: ModuleManifest = {
  id: "goals",
  label: "Goals",
  description: "What you are actually working towards, how far along you really are, and the one thing to change this week.",
  icon: "target",
  navGroup: "Do",
  routes: [{ href: "/goals", label: "Goals & Coach" }],
  enabledByDefault: true,
  quickTab: true,
  accent: "today",
};
