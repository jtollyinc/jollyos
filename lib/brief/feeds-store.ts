/**
 * lib/brief/feeds-store — feeds the owner ACCEPTED from the Brief's
 * suggestions, plus the catalog they came from. SERVER-SIDE ONLY (fs).
 * ────────────────────────────────────────────────────────────────────────────
 * DATA_DIR/brief-feeds.json holds only URLs the owner tapped Accept on.
 * Suggestions themselves are computed on the fly (lib/persona/interests
 * `suggestFeeds`) and never written here — nothing subscribes by itself.
 * BRIEF_FEEDS from the environment is merged in at read time by the builder.
 */
import { dataPath, readJson, writeJson } from "@/lib/data-dir";
import type { FeedCatalogEntry } from "@/lib/persona/interests";
import catalogJson from "./feed-catalog.json";

export interface AcceptedFeed {
  url: string;
  title: string;
  acceptedAt: string;
  /** Interest labels that led to the suggestion, for the receipt. */
  because: string[];
}

interface FeedsFile {
  accepted: AcceptedFeed[];
}

const file = () => dataPath("brief-feeds.json");

export function feedCatalog(): FeedCatalogEntry[] {
  return (catalogJson as { feeds: FeedCatalogEntry[] }).feeds;
}

export function readAcceptedFeeds(): AcceptedFeed[] {
  return readJson<FeedsFile>(file(), { accepted: [] }).accepted;
}

/** Idempotent: accepting the same URL twice keeps one row. */
export function acceptFeed(input: { url: string; title?: string; because?: string[] }): AcceptedFeed[] {
  const url = input.url.trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("A feed URL must start with http:// or https://.");
  const accepted = readAcceptedFeeds().filter((f) => f.url.toLowerCase() !== url.toLowerCase());
  const fromCatalog = feedCatalog().find((f) => f.url.toLowerCase() === url.toLowerCase());
  accepted.push({ url, title: (input.title ?? fromCatalog?.title ?? url).slice(0, 120), acceptedAt: new Date().toISOString(), because: (input.because ?? []).slice(0, 5) });
  writeJson(file(), { accepted });
  return accepted;
}

export function removeFeed(url: string): AcceptedFeed[] {
  const accepted = readAcceptedFeeds().filter((f) => f.url.toLowerCase() !== url.trim().toLowerCase());
  writeJson(file(), { accepted });
  return accepted;
}
