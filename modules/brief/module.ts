import type { ModuleManifest } from "@/lib/modules/types";

/**
 * Daily Brief: feeds in, one collapsed section per source, summaries out.
 *
 * No requiredEnv: feeds live in DATA_DIR (lib/brief/feeds-store) and are edited
 * in the page, so a one-click user with no .env can configure this module
 * entirely from the UI. BRIEF_FEEDS is still read and added on top.
 */
export const briefModule: ModuleManifest = {
  id: "brief",
  label: "Daily Brief",
  description: "Your feeds and your own cards, summarised into sections that stay folded until you tap.",
  icon: "newspaper",
  navGroup: "Read",
  routes: [{ href: "/brief", label: "Daily Brief" }],
  requiredProviders: ["llm"],
  enabledByDefault: true,
  quickTab: true,
  quickLabel: "Brief",
  accent: "news",
};
