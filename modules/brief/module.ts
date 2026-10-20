import type { ModuleManifest } from "@/lib/modules/types";

/** Daily Brief: feeds in, one collapsed section per source, summaries out. */
export const briefModule: ModuleManifest = {
  id: "brief",
  label: "Daily Brief",
  description: "Your feeds and your own cards, summarised into sections that stay folded until you tap.",
  icon: "newspaper",
  navGroup: "Read",
  routes: [{ href: "/brief", label: "Daily Brief" }],
  requiredEnv: ["BRIEF_FEEDS"],
  demoWaivesEnv: true,
  requiredProviders: ["llm"],
  enabledByDefault: true,
  quickTab: true,
  quickLabel: "Brief",
  accent: "news",
};
