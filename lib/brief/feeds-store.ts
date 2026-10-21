/**
 * lib/brief/feeds-store — feeds the owner ACCEPTED from the Brief's
 * suggestions, plus the catalog they came from. SERVER-SIDE ONLY (fs).
 * ────────────────────────────────────────────────────────────────────────────
 * DATA_DIR/brief-feeds.json holds the feeds the owner chose: tapped Accept on
 * a suggestion, picked a topic in the welcome walkthrough, or pasted a URL into
 * the Brief's feed editor. Suggestions themselves are computed on the fly
 * (lib/persona/interests `suggestFeeds`) and never written here — nothing
 * subscribes by itself.
 *
 * A feed can be switched OFF without losing it (`enabled: false`): the editor
 * needs a way to mute a noisy source without making the owner find the URL
 * again. `enabledFeedUrls` is what the builder reads.
 *
 * PRECEDENCE with the environment: BRIEF_FEEDS is added to this list, never
 * replaced by it, and an operator's env feed cannot be toggled off from the UI
 * (it is not stored here). README "Configuration" states the same rule.
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
  /** Off means "keep the URL, skip it when building". Missing = on. */
  enabled?: boolean;
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

/** The feeds the builder should actually fetch, in the order they were added. */
export function enabledFeedUrls(): string[] {
  return readAcceptedFeeds().filter((f) => f.enabled !== false).map((f) => f.url);
}

/** Idempotent: accepting the same URL twice keeps one row (and keeps it on). */
export function acceptFeed(input: { url: string; title?: string; because?: string[] }): AcceptedFeed[] {
  const url = input.url.trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("A feed URL must start with http:// or https://.");
  const accepted = readAcceptedFeeds().filter((f) => f.url.toLowerCase() !== url.toLowerCase());
  const fromCatalog = feedCatalog().find((f) => f.url.toLowerCase() === url.toLowerCase());
  accepted.push({ url, title: (input.title ?? fromCatalog?.title ?? url).slice(0, 120), acceptedAt: new Date().toISOString(), because: (input.because ?? []).slice(0, 5), enabled: true });
  writeJson(file(), { accepted });
  return accepted;
}

/** Keep the URL, stop fetching it. Unknown URLs are ignored. */
export function setFeedEnabled(url: string, enabled: boolean): AcceptedFeed[] {
  const want = url.trim().toLowerCase();
  const accepted = readAcceptedFeeds().map((f) => (f.url.toLowerCase() === want ? { ...f, enabled } : f));
  writeJson(file(), { accepted });
  return accepted;
}

export function removeFeed(url: string): AcceptedFeed[] {
  const accepted = readAcceptedFeeds().filter((f) => f.url.toLowerCase() !== url.trim().toLowerCase());
  writeJson(file(), { accepted });
  return accepted;
}
