/**
 * lib/brief/types — shapes shared by the brief builder and its UI.
 * Client-safe (types only).
 */
import type { TopicAccent } from "@/lib/modules/types";
import type { FeedSuggestion } from "@/lib/persona/interests";

export interface Story {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
  snippet: string;
  /** "matches: design systems · from your ChatGPT import" — null when nothing matched. */
  why?: string | null;
  matched?: string[];
  /** On an avoid-topic: kept in the list, shown only behind "show hidden". */
  hidden?: boolean;
}

export interface BriefSection {
  id: string;
  title: string;
  accent: TopicAccent;
  /** Model-written (or demo) summary; markdown-ish plain text. */
  summary: string;
  stories: Story[];
  /** Lines that need no model: counts, states. */
  facts: string[];
  /** How many stories sit behind "show hidden". */
  hidden?: number;
}

export interface BriefSource {
  label: string;
  kind: "rss" | "fixture";
  ok: boolean;
  count: number;
  note?: string;
}

/** What the persona contributed to this brief. Null until interests exist. */
export interface BriefPersonal {
  interests: number;
  avoid: number;
  hidden: number;
  /** Interest labels, best first (all tiers — this is the owner's own screen). */
  topics: string[];
  /** Where the interests came from: "your ChatGPT import", "your persona"… */
  sources: string[];
  /** How many interests were local-only and therefore withheld from a cloud summariser. */
  localOnly: number;
}

export interface Brief {
  generatedAt: string;
  /** Day key (YYYY-MM-DD) the cache is valid for. */
  day: string;
  headline: string;
  sections: BriefSection[];
  sources: BriefSource[];
  provider: string;
  model: string;
  routeNote: string | null;
  personal: BriefPersonal | null;
  /** Feeds the owner might want. Proposals only — nothing is subscribed until Accept. */
  suggestions: FeedSuggestion[];
  /** The interest profile version this brief was built with (cache key). */
  interestsVersion: string;
}
