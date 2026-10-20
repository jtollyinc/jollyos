import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authorizeExtraction, extractWithModel, parseModelLines } from "@/lib/import/modes";
import { readQueue } from "@/lib/import/queue";
import { resolveFolderInDataDir, runImport } from "@/lib/import/run";
import type { MinedText } from "@/lib/import/types";
import { demoProvider } from "@/lib/providers/demo";
import type { Provider } from "@/lib/providers/types";

/** A fake provider that records every prompt it receives. */
function fake(id: Provider["id"], kind: Provider["kind"], reply = ""): Provider & { calls: { system?: string; prompt: string }[] } {
  const calls: { system?: string; prompt: string }[] = [];
  return { id, kind, label: `${id} (fake)`, model: "fake", calls, async complete(req) { calls.push({ system: req.system, prompt: req.prompt }); return { text: reply, provider: id, model: "fake" }; } };
}

const SENTINEL = "SENTINEL-BUDGET-LINE";
const MINED: MinedText[] = [
  { text: `I prefer free tools. ${SENTINEL} is forty a month.`, ref: "c › 1", kind: "message" },
  { text: "Never add a feature the week a deadline lands.", ref: "c › 2", kind: "message" },
];

describe("authorizeExtraction (the gate)", () => {
  const cloud = fake("anthropic", "cloud");
  const local = fake("local", "local");

  it("rules always pass and touch no provider", () => {
    const a = authorizeExtraction("rules", false, { default: cloud, local: null, warnings: [] });
    expect(a).toMatchObject({ ok: true, provider: null });
  });

  it("local is refused with options when no local provider exists", () => {
    const a = authorizeExtraction("local", false, { default: cloud, local: null, warnings: [] });
    expect(a).toMatchObject({ ok: false, status: 409, options: ["rules", "cloud"] });
    expect(authorizeExtraction("local", false, { default: cloud, local, warnings: [] })).toMatchObject({ ok: true, provider: local });
  });

  it("cloud is refused without an explicit opt-in, and names the provider when allowed", () => {
    const refused = authorizeExtraction("cloud", false, { default: cloud, local, warnings: [] });
    expect(refused).toMatchObject({ ok: false, status: 403, options: ["rules", "local"] });
    expect((refused as { error: string }).error).toContain("anthropic (fake)");
    const allowed = authorizeExtraction("cloud", true, { default: cloud, local: null, warnings: [] });
    expect(allowed).toMatchObject({ ok: true, provider: cloud });
    expect((allowed as { note: string }).note).toContain("anthropic (fake)");
  });

  it("treats a local default as local even in cloud mode", () => {
    const a = authorizeExtraction("cloud", true, { default: local, local, warnings: [] });
    expect(a).toMatchObject({ ok: true, provider: local });
    expect((a as { note: string }).note).toMatch(/nothing left this machine/);
  });
});

describe("extractWithModel routing", () => {
  it("local mode: the text reaches only the local provider", async () => {
    const cloud = fake("anthropic", "cloud");
    const local = fake("local", "local", '{"category":"preference","text":"I prefer free tools.","confidence":0.9,"ref":"c › 1"}');
    const r = await extractWithModel(MINED, "local", { default: cloud, local, warnings: [] });
    expect(cloud.calls).toHaveLength(0);
    expect(local.calls).toHaveLength(1);
    expect(local.calls[0].system).toContain(SENTINEL);
    expect(r.fromModel).toBe(1);
    expect(r.items[0]).toMatchObject({ category: "preference", ref: "c › 1" });
    expect(r.fromRules).toBeGreaterThan(0); // rules fill in behind the model
  });

  it("cloud mode with opt-in: the text goes to the default provider; a demo provider falls back to rules", async () => {
    const cloud = fake("openai", "cloud", "no json here");
    const r = await extractWithModel(MINED, "cloud", { default: cloud, local: null, warnings: [] });
    expect(cloud.calls).toHaveLength(1);
    expect(cloud.calls[0].system).toContain(SENTINEL);
    expect(r.fromModel).toBe(0);
    expect(r.note).toMatch(/rules filled in/);
    const d = await extractWithModel(MINED, "cloud", { default: demoProvider(), local: null, warnings: [] });
    expect(d.items.length).toBeGreaterThan(0);
  });

  it("parses JSON lines leniently and drops junk", () => {
    const items = parseModelLines('```json\n{"category":"rule","text":"Never pad.","confidence":1.4},\nSure! Here you go\n{"category":"nope","text":"x"}\n{"text":"missing category"}\n```', "fallback");
    expect(items).toEqual([{ category: "rule", text: "Never pad.", confidence: 0.99, ref: "fallback" }]);
  });
});

describe("runImport enforces the gate before touching anything", () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "jollyos-run-")); process.env.DATA_DIR = dir; });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); delete process.env.DATA_DIR; });

  it("cloud without opt-in → 403, no provider call, nothing queued, no raw file written", async () => {
    const cloud = fake("anthropic", "cloud");
    const r = await runImport({ source: "paste", mode: "cloud", cloudOptIn: false, paste: `Saved memories\n- ${SENTINEL}` }, { default: cloud, local: null, warnings: [] });
    expect(r.status).toBe(403);
    expect(cloud.calls).toHaveLength(0);
    expect(readQueue()).toHaveLength(0);
    expect(fs.existsSync(path.join(dir, "imports", "queue.json"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "imports", "raw"))).toBe(false);
  });

  it("local without a local provider → 409 with the honest options", async () => {
    const r = await runImport({ source: "paste", mode: "local", cloudOptIn: false, paste: "- I prefer tea." }, { default: fake("openai", "cloud"), local: null, warnings: [] });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ options: ["rules", "cloud"] });
  });

  it("rules mode queues local-only candidates without any provider call; cloud opt-in is recorded on the batch", async () => {
    const cloud = fake("anthropic", "cloud", '{"category":"fact","text":"I am a designer.","confidence":0.8}');
    const ok = await runImport({ source: "paste", mode: "rules", cloudOptIn: false, paste: "Saved memories\n- User prefers short answers." }, { default: cloud, local: null, warnings: [] });
    expect(ok.status).toBe(201);
    expect(cloud.calls).toHaveLength(0);
    if (ok.status !== 201) throw new Error("unreachable");
    expect(ok.body.added[0]).toMatchObject({ privacy: "local-only", category: "preference", mode: "rules" });
    expect(ok.body.extraction.provider).toBeNull();

    const withOptIn = await runImport({ source: "paste", mode: "cloud", cloudOptIn: true, paste: "Saved memories\n- User likes long walks." }, { default: cloud, local: null, warnings: [] });
    expect(withOptIn.status).toBe(201);
    expect(cloud.calls).toHaveLength(1);
    if (withOptIn.status !== 201) throw new Error("unreachable");
    expect(withOptIn.body.batch.provider).toBe("anthropic (fake)");
    expect(withOptIn.body.extraction.fromModel).toBe(1);
  });

  it("only reads folders inside DATA_DIR", async () => {
    expect(resolveFolderInDataDir("../etc")).toBeNull();
    expect(resolveFolderInDataDir("/etc/passwd")).toBe(path.join(path.resolve(dir), "etc", "passwd")); // leading slash is relative to DATA_DIR
    fs.mkdirSync(path.join(dir, "notes"));
    fs.writeFileSync(path.join(dir, "notes", "a.md"), "- I always write things down before deciding.\n");
    const r = await runImport({ source: "markdown", mode: "rules", cloudOptIn: false, folder: "notes" }, { default: demoProvider(), local: null, warnings: [] });
    expect(r.status).toBe(201);
    if (r.status !== 201) throw new Error("unreachable");
    expect(r.body.added).toHaveLength(1);
    expect(r.body.batch.files).toEqual([{ name: "a.md", bytes: 46 }]);
    expect(fs.existsSync(path.join(dir, "imports", "raw"))).toBe(false); // folder notes are not copied
    const bad = await runImport({ source: "markdown", mode: "rules", cloudOptIn: false, folder: "../../" }, { default: demoProvider(), local: null, warnings: [] });
    expect(bad.status).toBe(400);
  });
});
