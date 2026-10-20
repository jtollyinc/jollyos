/**
 * lib/brief/types — shapes shared by the brief builder and its UI.
 * Client-safe (types only).
 */
import type { TopicAccent } from "@/lib/modules/types";

export interface Story {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
  snippet: string;
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
}

export interface BriefSource {
  label: string;
  kind: "rss" | "fixture";
  ok: boolean;
  count: number;
  note?: string;
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
}
