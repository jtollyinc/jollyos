import { describe, expect, it } from "vitest";
import { demoProvider } from "@/lib/providers/demo";
import { completeWithContext, providersFromEnv, routeSegments } from "@/lib/providers";
import type { ProviderSet } from "@/lib/providers/routing";
import type { ContextSegment, Provider } from "@/lib/providers/types";

/** A fake provider that records what it was asked, so a test can prove what was (not) sent. */
function fake(id: Provider["id"], kind: Provider["kind"]): Provider & { calls: { system?: string; prompt: string }[] } {
  const calls: { system?: string; prompt: string }[] = [];
  return {
    id, kind, label: `${id} (fake)`, model: "fake-model", calls,
    async complete(req) { calls.push({ system: req.system, prompt: req.prompt }); return { text: "ok", provider: id, model: "fake-model" }; },
  };
}

const SEGMENTS: ContextSegment[] = [
  { title: "profile", text: "- Designer at a small studio.", privacy: "public" },
  { title: "rule", text: "- Reversible decisions take five minutes.", privacy: "cloud-ok" },
  { title: "preference", text: "- SECRET-BUDGET-LINE", privacy: "local-only" },
];

describe("routeSegments", () => {
  it("sends everything to the default provider when nothing is local-only", () => {
    const cloud = fake("anthropic", "cloud");
    const set: ProviderSet = { default: cloud, local: null, warnings: [] };
    const r = routeSegments(SEGMENTS.filter((s) => s.privacy !== "local-only"), set);
    expect(r.provider).toBe(cloud);
    expect(r.segments).toHaveLength(2);
    expect(r.dropped).toHaveLength(0);
  });

  it("routes the whole prompt to the local provider when any segment is local-only", () => {
    const cloud = fake("anthropic", "cloud");
    const local = fake("local", "local");
    const r = routeSegments(SEGMENTS, { default: cloud, local, warnings: [] });
    expect(r.provider).toBe(local);
    expect(r.segments).toHaveLength(3);
    expect(r.dropped).toHaveLength(0);
  });

  it("drops local-only segments when no local provider exists and says so", () => {
    const cloud = fake("openai", "cloud");
    const r = routeSegments(SEGMENTS, { default: cloud, local: null, warnings: [] });
    expect(r.provider).toBe(cloud);
    expect(r.segments.map((s) => s.privacy)).toEqual(["public", "cloud-ok"]);
    expect(r.dropped).toHaveLength(1);
    expect(r.dropped[0].title).toBe("preference");
    expect(r.reason).toMatch(/withheld/);
  });

  it("treats the demo provider as NOT local: local-only content is withheld", () => {
    const r = routeSegments(SEGMENTS, { default: demoProvider(), local: null, warnings: [] });
    expect(r.dropped).toHaveLength(1);
  });
});

describe("completeWithContext", () => {
  it("never puts local-only text into a cloud prompt", async () => {
    const cloud = fake("anthropic", "cloud");
    const out = await completeWithContext({ instructions: "Answer.", segments: SEGMENTS, prompt: "Q?" }, { default: cloud, local: null, warnings: [] });
    expect(cloud.calls).toHaveLength(1);
    expect(cloud.calls[0].system).not.toContain("SECRET-BUDGET-LINE");
    expect(cloud.calls[0].system).toContain("Reversible decisions");
    expect(out.route.dropped).toHaveLength(1);
  });

  it("sends local-only text only to the local provider", async () => {
    const cloud = fake("anthropic", "cloud");
    const local = fake("local", "local");
    await completeWithContext({ instructions: "Answer.", segments: SEGMENTS, prompt: "Q?" }, { default: cloud, local, warnings: [] });
    expect(cloud.calls).toHaveLength(0);
    expect(local.calls).toHaveLength(1);
    expect(local.calls[0].system).toContain("SECRET-BUDGET-LINE");
  });
});

describe("providersFromEnv", () => {
  it("falls back to the demo provider with no keys", () => {
    const set = providersFromEnv({});
    expect(set.default.id).toBe("demo");
    expect(set.local).toBeNull();
    expect(set.warnings.join(" ")).toMatch(/demo provider/);
  });

  it("prefers an explicit LLM_PROVIDER and always fills the local slot", () => {
    const set = providersFromEnv({ LLM_PROVIDER: "local", LOCAL_LLM_BASE_URL: "http://localhost:1234/v1", ANTHROPIC_API_KEY: "not-a-real-key" });
    expect(set.default.id).toBe("local");
    expect(set.local?.id).toBe("local");
  });

  it("auto-detects the first configured cloud provider", () => {
    const set = providersFromEnv({ OPENAI_API_KEY: "not-a-real-key" });
    expect(set.default.id).toBe("openai");
  });

  it("warns and falls back when LLM_PROVIDER names an unconfigured provider", () => {
    const set = providersFromEnv({ LLM_PROVIDER: "anthropic" });
    expect(set.default.id).toBe("demo");
    expect(set.warnings.some((w) => w.includes("not configured"))).toBe(true);
  });
});

describe("demo provider", () => {
  it("is deterministic", async () => {
    const p = demoProvider();
    const a = await p.complete({ prompt: "Should I ship?", system: "- Clarity first", kind: "ask" });
    const b = await p.complete({ prompt: "Should I ship?", system: "- Clarity first", kind: "ask" });
    expect(a.text).toBe(b.text);
    expect(a.text).toMatch(/Recommendation/);
  });
});
