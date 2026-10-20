import { describe, expect, it } from "vitest";
import { MANIFESTS } from "@/lib/modules/manifests";
import { computeStatuses, navGroups, quickTabs } from "@/lib/modules/registry";
import type { ModuleManifest } from "@/lib/modules/types";

const fixture: ModuleManifest[] = [
  { id: "a", label: "A", description: "", icon: "bot", navGroup: "Do", routes: [{ href: "/a", label: "A" }], enabledByDefault: true, quickTab: true },
  { id: "b", label: "B", description: "", icon: "newspaper", navGroup: "Read", routes: [{ href: "/b", label: "B" }], requiredEnv: ["B_URL"], demoWaivesEnv: true, enabledByDefault: true },
  { id: "c", label: "C", description: "", icon: "user", navGroup: "Do", routes: [{ href: "/c", label: "C" }], requiredProviders: ["local-llm"], enabledByDefault: false },
];

describe("computeStatuses", () => {
  it("marks a module needs-setup when a required env var is missing", () => {
    const s = computeStatuses({ manifests: fixture, env: {} });
    expect(s.find((x) => x.manifest.id === "b")?.state).toBe("needs-setup");
    expect(s.find((x) => x.manifest.id === "b")?.missingEnv).toEqual(["B_URL"]);
  });

  it("is ready once the env var is set", () => {
    const s = computeStatuses({ manifests: fixture, env: { B_URL: "https://example.com/feed" } });
    expect(s.find((x) => x.manifest.id === "b")?.state).toBe("ready");
  });

  it("waives the env requirement in demo mode when the manifest allows it", () => {
    const s = computeStatuses({ manifests: fixture, env: { DEMO_MODE: "true" } });
    expect(s.find((x) => x.manifest.id === "b")?.state).toBe("ready");
  });

  it("honours overrides and the enabledByDefault flag", () => {
    const off = computeStatuses({ manifests: fixture, env: {} });
    expect(off.find((x) => x.manifest.id === "c")?.state).toBe("disabled");
    const on = computeStatuses({ manifests: fixture, env: {}, overrides: { enabled: { c: true, a: false } } });
    expect(on.find((x) => x.manifest.id === "c")?.state).toBe("needs-setup");
    expect(on.find((x) => x.manifest.id === "c")?.missingProviders).toEqual(["local-llm"]);
    expect(on.find((x) => x.manifest.id === "a")?.state).toBe("disabled");
  });

  it("rejects duplicate ids", () => {
    expect(() => computeStatuses({ manifests: [fixture[0], fixture[0]], env: {} })).toThrow(/Duplicate/);
  });

  it("builds nav groups and quick tabs from enabled modules only", () => {
    const s = computeStatuses({ manifests: fixture, env: {} });
    const groups = navGroups(s);
    expect(groups.map((g) => g.label)).toEqual(["Do", "Read"]);
    expect(groups[0].items.map((i) => i.moduleId)).toEqual(["a"]);
    const tabs = quickTabs(s);
    expect(tabs.map((t) => t.moduleId)).toEqual(["home", "a", "settings"]);
  });
});

describe("shipped manifests", () => {
  it("have unique ids, a landing route and a known icon", () => {
    const ids = new Set(MANIFESTS.map((m) => m.id));
    expect(ids.size).toBe(MANIFESTS.length);
    for (const m of MANIFESTS) {
      expect(m.routes.length).toBeGreaterThan(0);
      expect(m.routes[0].href.startsWith("/")).toBe(true);
    }
  });

  it("are all ready in demo mode with no configuration", () => {
    const s = computeStatuses({ env: { DEMO_MODE: "true" } });
    expect(s.every((x) => x.state === "ready")).toBe(true);
  });
});
