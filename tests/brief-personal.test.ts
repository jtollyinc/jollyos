import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildBrief, personaliseStories, readCachedBrief } from "@/lib/brief/build";
import { acceptFeed, readAcceptedFeeds } from "@/lib/brief/feeds-store";
import { deriveInterests } from "@/lib/persona/interests";
import { readInterests } from "@/lib/persona/interests-store";
import { addEntry } from "@/lib/persona/store";
import { createGoal } from "@/lib/goals/store";
import type { ProviderSet } from "@/lib/providers/routing";
import type { Provider } from "@/lib/providers/types";

function fake(id: Provider["id"], kind: Provider["kind"]): Provider & { calls: { system?: string; prompt: string }[] } {
  const calls: { system?: string; prompt: string }[] = [];
  return { id, kind, label: `${id} (fake)`, model: "fake", calls, async complete(req) { calls.push({ system: req.system, prompt: req.prompt }); return { text: "- ok", provider: id, model: "fake" }; } };
}

const LOCAL_SENTINEL = "zorbleweed";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "jollyos-brief-"));
  process.env.DATA_DIR = dir;
  process.env.DEMO_MODE = "true";
  fs.writeFileSync(path.join(dir, "brief-stories.json"), JSON.stringify({ sources: [{ label: "Fixture feed", stories: [
    { id: "a", title: "Design tokens for a component library", url: "https://example.com/a", publishedAt: "2026-03-02T06:00:00Z", snippet: "" },
    { id: "b", title: `The ${LOCAL_SENTINEL} growers' annual report`, url: "https://example.com/b", publishedAt: "2026-03-02T05:00:00Z", snippet: "" },
    { id: "c", title: "Bitcoin memecoin frenzy returns", url: "https://example.com/c", publishedAt: "2026-03-02T07:00:00Z", snippet: "crypto" },
    { id: "d", title: "Weather: mild week ahead", url: "https://example.com/d", publishedAt: "2026-03-02T08:00:00Z", snippet: "" },
  ] }] }));
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); delete process.env.DATA_DIR; delete process.env.DEMO_MODE; });

function seedPersona() {
  addEntry({ kind: "preference", text: "I'm into design systems. Keep answers short.", privacy: "cloud-ok", source: { kind: "chatgpt", ref: "Reading › message 1" } });
  addEntry({ kind: "preference", text: `I'm into ${LOCAL_SENTINEL} and follow it closely.`, privacy: "local-only", source: { kind: "claude", ref: "Garden › message 2" } });
  addEntry({ kind: "preference", text: "Don't show me crypto news.", privacy: "cloud-ok" });
}

describe("the Brief gets personal", () => {
  it("before any interests: generic brief, no why-lines, no suggestions, a CTA-worthy null", async () => {
    const cloud = fake("anthropic", "cloud");
    const brief = await buildBrief({ default: cloud, local: null, warnings: [] });
    expect(brief.personal).toBeNull();
    expect(brief.suggestions).toEqual([]);
    const feed = brief.sections.find((s) => s.title === "Fixture feed")!;
    expect(feed.stories.every((s) => s.why === undefined)).toBe(true);
    expect(feed.stories.map((s) => s.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("after approving imports: ranks, hides, explains, suggests — and never puts a local-only interest in a cloud prompt", async () => {
    seedPersona();
    expect(readInterests().interests.map((i) => i.topic)).toContain(`custom:${LOCAL_SENTINEL}`);
    const cloud = fake("anthropic", "cloud");
    const brief = await buildBrief({ default: cloud, local: null, warnings: [] });

    const feed = brief.sections.find((s) => s.title === "Fixture feed")!;
    expect(feed.stories[0].id).toBe("a");
    expect(feed.stories[0].why).toBe("matches: design systems · from your ChatGPT import");
    expect(feed.stories.find((s) => s.id === "b")!.why).toContain(LOCAL_SENTINEL); // local-only interest DID rank (keyword match on this server)
    const hidden = feed.stories.find((s) => s.id === "c")!;
    expect(hidden.hidden).toBe(true);
    expect(feed.stories[feed.stories.length - 1].id).toBe("c");
    expect(feed.hidden).toBe(1);
    expect(brief.personal).toMatchObject({ interests: 2, avoid: 1, hidden: 1, localOnly: 1 });
    expect(brief.personal!.sources).toEqual(expect.arrayContaining(["your ChatGPT import", "your Claude import"]));
    expect(brief.headline).toContain("for you");

    // The privacy rule, enforced server-side: the cloud summariser saw neither the local-only
    // interest nor the hidden story, and the brief says what was withheld.
    expect(cloud.calls.length).toBeGreaterThan(0);
    for (const call of cloud.calls) {
      expect(call.system).not.toContain(LOCAL_SENTINEL);            // no local-only interest segment
      expect(call.prompt).not.toMatch(/matches:[^\n]*zorbleweed/);  // no local-only label in the story annotations
      expect(call.prompt).toContain("matches: design systems");     // cloud-ok labels are fine
      expect(call.prompt).not.toContain("Bitcoin");                 // hidden stories are not summarised
      expect(call.system).toContain("design systems");
    }
    expect(brief.routeNote).toMatch(/withheld/);

    // Suggestions are proposals: they exclude avoid topics and nothing was subscribed.
    expect(brief.suggestions.length).toBeGreaterThan(0);
    expect(brief.suggestions.every((s) => !s.topics.includes("crypto"))).toBe(true);
    expect(brief.suggestions[0].why).toMatch(/^because you follow design systems/);
    expect(readAcceptedFeeds()).toEqual([]);
  });

  it("with a local provider, everything (including the local-only interest) goes to the local model only", async () => {
    seedPersona();
    const cloud = fake("anthropic", "cloud");
    const local = fake("local", "local");
    await buildBrief({ default: cloud, local, warnings: [] });
    expect(cloud.calls).toHaveLength(0);
    expect(local.calls.length).toBeGreaterThan(0);
    expect(local.calls.some((c) => c.system?.includes(LOCAL_SENTINEL))).toBe(true);
  });

  it("the day cache is keyed on the interest version, so approving imports refreshes the brief", async () => {
    const set: ProviderSet = { default: fake("anthropic", "cloud"), local: null, warnings: [] };
    const first = await buildBrief(set);
    expect(readCachedBrief()?.generatedAt).toBe(first.generatedAt);
    seedPersona();
    expect(readCachedBrief()).toBeNull();
    const second = await buildBrief(set);
    expect(second.interestsVersion).not.toBe(first.interestsVersion);
    expect(readCachedBrief()?.generatedAt).toBe(second.generatedAt);
  });

  it("accepting a suggestion is the only way a feed is added, and it is excluded from later suggestions", async () => {
    seedPersona();
    const set: ProviderSet = { default: fake("anthropic", "cloud"), local: null, warnings: [] };
    const brief = await buildBrief(set);
    const pick = brief.suggestions[0];
    acceptFeed({ url: pick.url, title: pick.title, because: pick.because });
    expect(readAcceptedFeeds()).toHaveLength(1);
    const again = await buildBrief(set);
    expect(again.suggestions.map((s) => s.url)).not.toContain(pick.url);
    expect(() => acceptFeed({ url: "not a url" })).toThrow();
  });

  it("labels a story that relates to a goal, and pulls it to the front", async () => {
    createGoal({ area: "creative", want: "Build a component library", why: "design tokens keep drifting", privacy: "cloud-ok" });
    const cloud = fake("anthropic", "cloud");
    const brief = await buildBrief({ default: cloud, local: null, warnings: [] });
    const feed = brief.sections.find((s) => s.title === "Fixture feed")!;

    const tagged = feed.stories.find((s) => s.goal);
    expect(tagged?.id).toBe("a"); // "Design tokens for a component library"
    expect(tagged?.goal?.want).toBe("Build a component library");
    expect(feed.stories[0].id).toBe("a");
    expect(feed.facts.join(" ")).toContain("1 for your goals");
    // A cloud-ok goal may be named in the prompt, so the summary can use it.
    expect(cloud.calls.map((c) => c.prompt).join("\n")).toContain("for their goal: Build a component library");
  });

  it("a local-only goal may label a story but never reaches a cloud prompt", async () => {
    // LOCAL_SENTINEL is a word in a fixture STORY, so it legitimately reaches
    // the prompt. GOAL_SENTINEL exists only inside the private goal, which is
    // what must not travel.
    const GOAL_SENTINEL = "quibblewort";
    createGoal({ area: "health", want: `Grow ${LOCAL_SENTINEL} for the annual report`, why: `${GOAL_SENTINEL} keeps me sane`, privacy: "local-only" });
    const cloud = fake("anthropic", "cloud");
    const brief = await buildBrief({ default: cloud, local: null, warnings: [] });
    const feed = brief.sections.find((s) => s.title === "Fixture feed")!;

    // The owner's own screen sees the label...
    expect(feed.stories.find((s) => s.id === "b")?.goal?.want).toContain(LOCAL_SENTINEL);
    // ...and the hosted model is told nothing about the goal: not the private
    // words, and not even that the story belongs to one.
    const sent = cloud.calls.map((c) => `${c.system ?? ""} ${c.prompt}`).join("\n");
    expect(sent).not.toContain(GOAL_SENTINEL);
    expect(sent).not.toContain("for their goal");
  });

  it("personaliseStories is a no-op for an empty profile", () => {
    const stories = [{ id: "x", title: "t", url: "u", source: "s", publishedAt: null, snippet: "" }];
    expect(personaliseStories(stories, deriveInterests([]))).toEqual({ stories, hidden: 0, forGoals: 0 });
  });
});
