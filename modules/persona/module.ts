import type { ModuleManifest } from "@/lib/modules/types";

/** Persona: the model of you, Ask Myself on top of it, and the Decision Deck that feeds it. */
export const personaModule: ModuleManifest = {
  id: "persona",
  label: "You",
  description: "A privacy-tagged model of how you decide. Ask it questions; swipe a deck to teach it.",
  icon: "user",
  navGroup: "You",
  routes: [
    { href: "/persona", label: "Persona" },
    { href: "/persona/ask", label: "Ask Myself" },
    { href: "/persona/deck", label: "Decision Deck" },
    { href: "/persona/import", label: "Import your context" },
  ],
  requiredProviders: ["llm"],
  enabledByDefault: true,
  quickTab: true,
  accent: "you",
};
