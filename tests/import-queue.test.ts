import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bulkReview, createBatch, deleteRawFiles, enqueue, queueCounts, rawFilesSummary, readQueue, reviewCandidate } from "@/lib/import/queue";
import { importSamples } from "@/lib/import/samples";
import { DEFAULT_IMPORT_PRIVACY, type ExtractedItem } from "@/lib/import/types";
import { readInterests } from "@/lib/persona/interests-store";
import { readEntries } from "@/lib/persona/store";

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "jollyos-import-")); process.env.DATA_DIR = dir; });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); delete process.env.DATA_DIR; });

const ITEMS: ExtractedItem[] = [
  { category: "preference", text: "I prefer free tools until the paid plan saves two hours a month.", ref: "Pricing › message 1", confidence: 0.85 },
  { category: "rule", text: "Never add a feature the week a client deadline lands.", ref: "Pricing › message 3", confidence: 0.8 },
  { category: "fact", text: "I'm a product designer at a four-person studio.", ref: "Pricing › message 1", confidence: 0.7 },
  { category: "interest", text: "I'm into design systems and accessibility.", ref: "Reading › message 1", confidence: 0.6 },
  { category: "avoid", text: "Don't show me crypto news.", ref: "Reading › message 3", confidence: 0.5 },
];

describe("review queue", () => {
  it("stores raw uploads, queues candidates as local-only and dedupes repeats", () => {
    const batch = createBatch({ source: "chatgpt", mode: "rules", files: [{ name: "../../etc/conversations.json", data: Buffer.from("[]") }], warnings: [], provider: null });
    expect(fs.existsSync(path.join(dir, "imports", "raw", batch.id, "conversations.json"))).toBe(true);
    expect(batch.files[0].name).toBe("conversations.json");
    const added = enqueue(batch, ITEMS);
    expect(added).toHaveLength(5);
    expect(added.every((c) => c.privacy === "local-only" && c.status === "pending" && c.source === "chatgpt")).toBe(true);
    expect(DEFAULT_IMPORT_PRIVACY).toBe("local-only");
    expect(enqueue(batch, ITEMS)).toHaveLength(0);
    expect(queueCounts()).toEqual({ total: 5, pending: 5, approved: 0, rejected: 0 });
    expect(readEntries()).toHaveLength(0); // nothing in the persona yet
  });

  it("approve creates exactly one persona entry with the mapped kind, the reviewed privacy and the source", () => {
    const batch = createBatch({ source: "claude", mode: "rules", files: [], warnings: [], provider: null });
    const [pref, rule, fact] = enqueue(batch, ITEMS);
    const r = reviewCandidate(pref.id, "approve", { privacy: "cloud-ok" })!;
    expect(r.entry).toMatchObject({ kind: "preference", privacy: "cloud-ok", source: { kind: "claude", ref: "Pricing › message 1" } });
    expect(reviewCandidate(pref.id, "approve")!.entry).toBeNull(); // idempotent
    expect(reviewCandidate(rule.id, "approve")!.entry!.kind).toBe("rule");
    expect(reviewCandidate(fact.id, "approve")!.entry).toMatchObject({ kind: "profile", privacy: "local-only" });
    expect(readEntries()).toHaveLength(3);
    expect(readQueue().filter((c) => c.status === "approved")).toHaveLength(3);
  });

  it("reject leaves a tombstone, edit changes a pending item, reset reopens it", () => {
    const batch = createBatch({ source: "paste", mode: "rules", files: [], warnings: [], provider: null });
    const [a, b] = enqueue(batch, ITEMS);
    expect(reviewCandidate(a.id, "reject")!.candidate.status).toBe("rejected");
    expect(readEntries()).toHaveLength(0);
    expect(enqueue(batch, [ITEMS[0]])).toHaveLength(0); // the tombstone blocks a re-import
    const edited = reviewCandidate(b.id, "edit", { text: "Never ship the week a deadline lands.", category: "value" })!.candidate;
    expect(edited).toMatchObject({ text: "Never ship the week a deadline lands.", category: "value", status: "pending" });
    expect(reviewCandidate(a.id, "reset")!.candidate.status).toBe("pending");
    expect(reviewCandidate("missing", "approve")).toBeNull();
  });

  it("bulk approve honours a confidence floor and refreshes the derived interests", () => {
    const batch = createBatch({ source: "chatgpt", mode: "rules", files: [], warnings: [], provider: null });
    enqueue(batch, ITEMS);
    expect(readInterests().version).toBe("none");
    expect(bulkReview("approve", { minConfidence: 0.6 })).toEqual({ count: 4 });
    expect(queueCounts()).toMatchObject({ approved: 4, pending: 1 });
    const profile = readInterests();
    expect(profile.interests.map((i) => i.topic)).toContain("design-systems");
    expect(profile.interests.find((i) => i.topic === "design-systems")!.sources).toEqual(["your ChatGPT import"]);
    expect(bulkReview("reject")).toEqual({ count: 1 });
    expect(readInterests().avoid).toHaveLength(0); // the rejected avoid line never entered the persona
  });

  it("delete raw files removes the bytes and keeps the queue and the persona", () => {
    const batch = createBatch({ source: "chatgpt", mode: "rules", files: [{ name: "a.json", data: Buffer.alloc(1000, 1) }, { name: "a.json", data: Buffer.alloc(10, 2) }], warnings: [], provider: null });
    enqueue(batch, ITEMS);
    reviewCandidate(readQueue()[0].id, "approve");
    expect(rawFilesSummary()).toEqual({ files: 2, bytes: 1010, batches: 1 });
    expect(deleteRawFiles()).toEqual({ files: 2, bytes: 1010 });
    expect(rawFilesSummary()).toEqual({ files: 0, bytes: 0, batches: 0 });
    expect(fs.existsSync(path.join(dir, "imports", "raw"))).toBe(false);
    expect(readQueue()).toHaveLength(5);
    expect(readEntries()).toHaveLength(1);
  });
});

describe("sample import (demo)", () => {
  it("runs each fictional sample as its own batch, rule-based, keeping no raw copies", async () => {
    const results = await importSamples();
    expect(results).toHaveLength(4);
    for (const r of results) expect(r.status).toBe(201);
    const queue = readQueue();
    expect(new Set(queue.map((c) => c.source))).toEqual(new Set(["chatgpt", "claude", "markdown", "paste"]));
    expect(queue.length).toBeGreaterThan(15);
    expect(queue.every((c) => c.privacy === "local-only" && c.status === "pending")).toBe(true);
    expect(rawFilesSummary().files).toBe(0);
    expect(readEntries()).toHaveLength(0);
  });
});
