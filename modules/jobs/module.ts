import type { ModuleManifest } from "@/lib/modules/types";

/** Jobs board + Capture: a text box becomes a card, a runner moves it along. */
export const jobsModule: ModuleManifest = {
  id: "jobs",
  label: "Jobs",
  description: "Capture a thought as a card and pick who runs it — Auto, your API, a CLI agent, or a local model. Private cards never leave the machine.",
  icon: "bot",
  navGroup: "Do",
  routes: [{ href: "/jobs", label: "Jobs board" }],
  requiredProviders: ["llm"],
  enabledByDefault: true,
  quickTab: true,
  accent: "jobs",
};
