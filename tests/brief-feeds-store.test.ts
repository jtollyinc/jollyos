/**
 * The feed list the owner owns: adding by hand, muting without losing, and how
 * it combines with BRIEF_FEEDS. This is the path that replaces "edit .env" for
 * anybody who downloaded a zip, so the precedence rule is pinned here.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acceptFeed, enabledFeedUrls, feedCatalog, readAcceptedFeeds, removeFeed, setFeedEnabled } from "@/lib/brief/feeds-store";
import { briefFeeds } from "@/lib/config";
import { briefModule } from "@/modules/brief/module";

const A = "https://example.com/feed";
const B = "https://example.org/atom.xml";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "jollyos-feeds-"));
  process.env.DATA_DIR = dir;
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
  delete process.env.BRIEF_FEEDS;
});

describe("the owner's feed list", () => {
  it("starts empty and stores what is added, in DATA_DIR", () => {
    expect(readAcceptedFeeds()).toEqual([]);
    acceptFeed({ url: A, title: "Example" });
    expect(fs.existsSync(path.join(dir, "brief-feeds.json"))).toBe(true);
    expect(readAcceptedFeeds().map((f) => f.url)).toEqual([A]);
  });

  it("refuses something that is not a URL", () => {
    expect(() => acceptFeed({ url: "example.com/feed" })).toThrow(/http/);
  });

  it("adding the same URL twice keeps one row", () => {
    acceptFeed({ url: A });
    acceptFeed({ url: A.toUpperCase().replace("HTTPS", "https") });
    expect(readAcceptedFeeds()).toHaveLength(1);
  });

  it("a muted feed keeps its URL but stops being fetched", () => {
    acceptFeed({ url: A, title: "A" });
    acceptFeed({ url: B, title: "B" });
    setFeedEnabled(A, false);
    expect(readAcceptedFeeds()).toHaveLength(2);
    expect(enabledFeedUrls()).toEqual([B]);
    setFeedEnabled(A, true);
    expect(enabledFeedUrls()).toEqual([A, B]);
  });

  it("a feed with no enabled flag (written by an older version) counts as on", () => {
    fs.writeFileSync(path.join(dir, "brief-feeds.json"), JSON.stringify({ accepted: [{ url: A, title: "A", acceptedAt: "2026-01-01T00:00:00Z", because: [] }] }));
    expect(enabledFeedUrls()).toEqual([A]);
  });

  it("toggling an unknown URL changes nothing", () => {
    acceptFeed({ url: A });
    setFeedEnabled("https://nope.example/feed", false);
    expect(enabledFeedUrls()).toEqual([A]);
  });

  it("removing one leaves the rest", () => {
    acceptFeed({ url: A });
    acceptFeed({ url: B });
    removeFeed(A);
    expect(readAcceptedFeeds().map((f) => f.url)).toEqual([B]);
  });
});

describe("BRIEF_FEEDS precedence", () => {
  it("env feeds are additional, not a replacement, and are not in the editable list", () => {
    process.env.BRIEF_FEEDS = `${A}, https://operator.example/feed`;
    acceptFeed({ url: B });
    expect(briefFeeds()).toEqual([A, "https://operator.example/feed"]);
    expect(enabledFeedUrls()).toEqual([B]);
    // What the builder reads: env first, then the owner's, in that order.
    expect([...briefFeeds(), ...enabledFeedUrls()]).toEqual([A, "https://operator.example/feed", B]);
  });

  it("the owner cannot mute an env feed, because it is not stored here", () => {
    process.env.BRIEF_FEEDS = A;
    setFeedEnabled(A, false);
    expect(briefFeeds()).toEqual([A]);
    expect(readAcceptedFeeds()).toEqual([]);
  });

  it("the Brief module no longer demands BRIEF_FEEDS, so a zip user is never blocked", () => {
    expect(briefModule.requiredEnv ?? []).toEqual([]);
  });
});

describe("the shipped catalog", () => {
  it("has unique ids and https URLs only", () => {
    const feeds = feedCatalog();
    expect(feeds.length).toBeGreaterThan(20);
    expect(new Set(feeds.map((f) => f.id)).size).toBe(feeds.length);
    expect(new Set(feeds.map((f) => f.url)).size).toBe(feeds.length);
    for (const f of feeds) expect(f.url, f.id).toMatch(/^https:\/\//);
  });
});
