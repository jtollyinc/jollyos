/**
 * lib/onboarding/topics — the chips on the "What you follow" screen, and the
 * sensitive categories on the privacy screen. Client-safe plain data.
 * ────────────────────────────────────────────────────────────────────────────
 * A chip is a plain-language label over one or more interest topic ids from
 * lib/persona/interests (TOPICS). Tapping it writes a persona entry ("I follow
 * design systems."), which is what actually derives the interest profile — so
 * the Brief ranks by the same mechanism an import would use, with no special
 * case for the walkthrough.
 *
 * Every chip here has at least one working feed in lib/brief/feed-catalog.json
 * (all URLs re-verified 2026-10-21), so tapping a chip can never produce an
 * empty Brief.
 */

export type SensitiveId = "finance" | "health" | "family" | "location";

export interface TopicChip {
  id: string;
  label: string;
  /** Which row it sits in. */
  group: "work" | "life";
  /** Interest topic ids from lib/persona/interests TOPICS. */
  topics: string[];
  /** When set, this chip's interest is local-only if that category is protected. */
  sensitive?: SensitiveId;
}

export const TOPIC_CHIPS: readonly TopicChip[] = [
  { id: "design", label: "Design & UX", group: "work", topics: ["design-systems", "product-design", "ux-research"] },
  { id: "accessibility", label: "Accessibility", group: "work", topics: ["accessibility"] },
  { id: "frontend", label: "Front-end & CSS", group: "work", topics: ["frontend", "css"] },
  { id: "react", label: "React & Next.js", group: "work", topics: ["react-next"] },
  { id: "ai", label: "AI tools", group: "work", topics: ["ai-tools"] },
  { id: "local-models", label: "Local models", group: "work", topics: ["local-models"] },
  { id: "selfhosting", label: "Self-hosting", group: "work", topics: ["self-hosting"] },
  { id: "opensource", label: "Open source", group: "work", topics: ["open-source"] },
  { id: "privacy", label: "Privacy & security", group: "work", topics: ["privacy-security"] },
  { id: "productivity", label: "Habits & focus", group: "life", topics: ["productivity", "adhd-habits"] },
  { id: "writing", label: "Writing", group: "life", topics: ["writing"] },
  { id: "science", label: "Science & space", group: "life", topics: ["science"] },
  { id: "cooking", label: "Cooking", group: "life", topics: ["cooking"] },
  { id: "outdoors", label: "Cycling & outdoors", group: "life", topics: ["cycling", "outdoors"] },
  { id: "photography", label: "Photography", group: "life", topics: ["photography"] },
  { id: "gaming", label: "Gaming", group: "life", topics: ["gaming"] },
  { id: "music", label: "Music", group: "life", topics: ["music"] },
  { id: "money", label: "Personal finance", group: "life", topics: ["personal-finance"], sensitive: "finance" },
] as const;

export const chipById = (id: string): TopicChip | undefined => TOPIC_CHIPS.find((c) => c.id === id);

export interface SensitiveCategory {
  id: SensitiveId;
  label: string;
  /** Plain words, on the screen. No "PII", no "routing". */
  plain: string;
  defaultOn: boolean;
  /** The persona rule written when it is protected. Local-only, so the router withholds it. */
  rule: string;
}

export const SENSITIVE: readonly SensitiveCategory[] = [
  { id: "finance", label: "Money", plain: "Pay, bills, savings, what things cost.", defaultOn: true, rule: "Anything about my money — pay, bills, savings, what things cost — stays on this machine." },
  { id: "health", label: "Health", plain: "Symptoms, medication, how you are doing.", defaultOn: true, rule: "Anything about my health — symptoms, medication, how I am doing — stays on this machine." },
  { id: "family", label: "Family & people", plain: "Your household, your friends, your colleagues.", defaultOn: true, rule: "Anything about the people in my life — family, friends, colleagues — stays on this machine." },
  { id: "location", label: "Where you are", plain: "Your address, your town, where you travel.", defaultOn: true, rule: "Anything about where I live or travel stays on this machine." },
] as const;

export const DEFAULT_LOCAL_ONLY: SensitiveId[] = SENSITIVE.filter((s) => s.defaultOn).map((s) => s.id);

export const isSensitiveId = (v: unknown): v is SensitiveId => SENSITIVE.some((s) => s.id === v);

/** Topic ids that must be tagged local-only given the protected categories. */
export function localOnlyTopics(protectedIds: string[]): Set<string> {
  const out = new Set<string>();
  for (const chip of TOPIC_CHIPS) {
    if (chip.sensitive && protectedIds.includes(chip.sensitive)) for (const t of chip.topics) out.add(t);
  }
  return out;
}
