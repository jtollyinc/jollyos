import { describe, expect, it } from "vitest";
import catalogJson from "@/lib/brief/feed-catalog.json";
import { deriveInterests, interestSegments, matchTopics, rankStories, scoreStory, suggestFeeds, TOPICS, type FeedCatalogEntry, type InterestInput } from "@/lib/persona/interests";

const e = (id: string, text: string, privacy: InterestInput["privacy"] = "cloud-ok", source?: InterestInput["source"]): InterestInput => ({ id, text, privacy, source });

const PERSONA: InterestInput[] = [
  e("p1", "Alex Rivera, product designer at a four-person studio, building a tiny habit-tracking app on the side.", "public"),
  e("i1", "I'm into design systems and accessibility, and I read a lot about typography.", "cloud-ok", { kind: "chatgpt", ref: "Reading list › message 1" }),
  e("i2", "I self-host everything I can; local models first.", "local-only", { kind: "claude", ref: "Self-hosting › message 1" }),
  e("a1", "Don't show me crypto news, I'm not interested in it at all, and skip celebrity gossip.", "cloud-ok", { kind: "chatgpt", ref: "Reading list › message 3" }),
  e("i3", "I'm into mechanical keyboards lately.", "cloud-ok", { kind: "paste" }),
];

const STORIES = [
  { id: "s1", title: "Design tokens at scale: one studio's component library", snippet: "", publishedAt: "2026-03-02T06:00:00Z" },
  { id: "s2", title: "Bitcoin hits a new high as memecoin mania returns", snippet: "crypto markets", publishedAt: "2026-03-02T07:00:00Z" },
  { id: "s3", title: "Running a 7B model on a laptop for private summaries", snippet: "local models benchmark", publishedAt: "2026-03-02T05:00:00Z" },
  { id: "s4", title: "City council approves new bike lanes", snippet: "", publishedAt: "2026-03-02T08:00:00Z" },
  { id: "s5", title: "A mechanical keyboards revival among typists", snippet: "", publishedAt: "2026-03-01T08:00:00Z" },
];

describe("deriveInterests", () => {
  const profile = deriveInterests(PERSONA, "2026-03-02T00:00:00.000Z");

  it("finds catalog topics, explicit phrases and avoid-topics deterministically", () => {
    const ids = profile.interests.map((i) => i.topic);
    expect(ids).toEqual(expect.arrayContaining(["design-systems", "accessibility", "typography", "product-design", "adhd-habits", "self-hosting", "local-models", "custom:mechanical-keyboards"]));
    expect(profile.avoid.map((a) => a.topic).sort()).toEqual(["celebrity", "crypto"]);
    expect(ids).not.toContain("crypto");
    expect(deriveInterests(PERSONA, "2026-03-02T00:00:00.000Z")).toEqual(profile);
    expect(profile.version).not.toBe("none");
  });

  it("inherits the most restrictive privacy and remembers where each interest came from", () => {
    const local = profile.interests.find((i) => i.topic === "self-hosting")!;
    expect(local.privacy).toBe("local-only");
    expect(local.sources).toEqual(["your Claude import"]);
    const ds = profile.interests.find((i) => i.topic === "design-systems")!;
    expect(ds.privacy).toBe("cloud-ok");
    expect(ds.sources).toEqual(["your ChatGPT import"]);
    const pd = profile.interests.find((i) => i.topic === "product-design")!;
    expect(pd.sources).toContain("your persona");
  });

  it("tightens privacy when a local-only entry joins a cloud-ok topic", () => {
    const p = deriveInterests([e("a", "I follow cycling.", "cloud-ok"), e("b", "My gravel bike rides are my therapy.", "local-only")]);
    expect(p.interests.find((i) => i.topic === "cycling")!.privacy).toBe("local-only");
    expect(p.interests.find((i) => i.topic === "cycling")!.weight).toBe(2);
  });

  it("returns the empty profile for an empty persona", () => {
    expect(deriveInterests([]).version).toBe("none");
    expect(matchTopics("nothing relevant here at all")).toEqual([]);
    expect(TOPICS.every((t) => t.keywords.length > 0)).toBe(true);
  });
});

describe("ranking and why-lines", () => {
  const profile = deriveInterests(PERSONA);

  it("boosts matched stories, hides avoid-topic stories last, and explains each", () => {
    const ranked = rankStories(STORIES, profile);
    expect(ranked[0].id).toBe("s1");
    expect(ranked[ranked.length - 1].id).toBe("s2");
    expect(ranked[ranked.length - 1].match.hidden).toBe(true);
    expect(ranked.find((r) => r.id === "s4")!.match.hidden).toBe(false);
    expect(ranked.find((r) => r.id === "s4")!.match.why).toBeNull();
    const why = ranked[0].match.why!;
    expect(why).toMatch(/^matches: /);
    expect(why).toContain("design systems");
    expect(why).toContain("from your ChatGPT import");
    expect(ranked.find((r) => r.id === "s5")!.match.matched).toContain("mechanical keyboards");
  });

  it("scores with a cap so one noisy topic cannot dominate", () => {
    const heavy = deriveInterests(Array.from({ length: 10 }, (_, i) => e(`x${i}`, "I love cycling and bikes.")));
    expect(scoreStory({ title: "Bike ride" }, heavy).score).toBe(3);
    expect(scoreStory({ title: "Crypto crash", snippet: "" }, profile).score).toBeLessThan(0);
  });
});

describe("feed suggestions never auto-subscribe", () => {
  const catalog = (catalogJson as { feeds: FeedCatalogEntry[] }).feeds;
  const profile = deriveInterests(PERSONA);

  it("proposes feeds for matched topics, skips avoid topics and already-accepted URLs", () => {
    const s = suggestFeeds(catalog, profile);
    expect(s.length).toBeGreaterThan(0);
    expect(s.length).toBeLessThanOrEqual(6);
    expect(s.some((f) => f.id === "a11yproject" || f.id === "smashing")).toBe(true);
    expect(s.every((f) => !f.topics.includes("crypto"))).toBe(true);
    expect(s[0].why).toMatch(/^because you follow /);
    const accepted = [s[0].url];
    expect(suggestFeeds(catalog, profile, accepted).map((f) => f.url)).not.toContain(s[0].url);
  });

  it("is pure: calling it changes nothing and an empty profile suggests nothing", () => {
    const before = JSON.stringify(catalog);
    suggestFeeds(catalog, profile);
    expect(JSON.stringify(catalog)).toBe(before);
    expect(suggestFeeds(catalog, deriveInterests([]))).toEqual([]);
  });

  it("ships a small catalog of real, topic-tagged feeds", () => {
    expect(catalog.length).toBeGreaterThanOrEqual(18);
    expect(catalog.length).toBeLessThanOrEqual(26);
    const ids = new Set(TOPICS.map((t) => t.id));
    for (const f of catalog) {
      expect(f.url).toMatch(/^https:\/\//);
      expect(f.topics.length).toBeGreaterThan(0);
      for (const t of f.topics) expect(ids.has(t)).toBe(true);
    }
    expect(new Set(catalog.map((f) => f.url)).size).toBe(catalog.length);
  });
});

describe("interest segments carry privacy", () => {
  it("tags local-only interests so the router can withhold them", () => {
    const segs = interestSegments(deriveInterests(PERSONA));
    const local = segs.filter((s) => s.privacy === "local-only").map((s) => s.text);
    expect(local.join("\n")).toContain("self-hosting");
    expect(segs.filter((s) => s.title === "avoid topic").map((s) => s.text).join("\n")).toContain("crypto");
  });
});
