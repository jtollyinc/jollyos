import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { privacyForCard, summariseSession, tagCard, type DeckAnswer } from "@/lib/persona/deck";
import { readAnswers, recordAnswer } from "@/lib/persona/deck-store";
import { addEntry, filterForAudience, personaSegments, readEntries, type PersonaEntry } from "@/lib/persona/store";
import { SEED_CARDS } from "@/modules/persona/cards";

const entry = (privacy: PersonaEntry["privacy"], text: string, kind: PersonaEntry["kind"] = "value"): PersonaEntry => ({
  id: text, kind, text, privacy, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("filterForAudience", () => {
  const entries = [entry("public", "p"), entry("cloud-ok", "c"), entry("local-only", "l")];

  it("hides local-only entries from a cloud audience", () => {
    expect(filterForAudience(entries, "cloud").map((e) => e.text)).toEqual(["p", "c"]);
  });

  it("gives a local audience everything", () => {
    expect(filterForAudience(entries, "local").map((e) => e.text)).toEqual(["p", "c", "l"]);
  });

  it("keeps the tag on every segment it emits", () => {
    const segs = personaSegments(entries);
    expect(segs.map((s) => s.privacy)).toEqual(["public", "cloud-ok", "local-only"]);
    expect(segs.every((s) => s.text.startsWith("- "))).toBe(true);
  });
});

describe("decision deck privacy gate", () => {
  it("makes money and people cards local-only by category", () => {
    for (const c of SEED_CARDS.filter((c) => c.category === "money" || c.category === "people")) {
      expect(privacyForCard(c)).toBe("local-only");
    }
  });

  it("makes a card local-only when its text touches a private topic", () => {
    expect(privacyForCard({ category: "time", prompt: "Skip the doctor to finish the sprint?", a: "Skip", b: "Go" })).toBe("local-only");
    expect(privacyForCard({ category: "building", prompt: "Ship rough or polish?", a: "Ship", b: "Polish" })).toBe("cloud-ok");
  });

  it("lets a declared tag tighten but never loosen", () => {
    expect(privacyForCard({ category: "building", prompt: "x", a: "y", b: "z", privacy: "local-only" })).toBe("local-only");
    expect(privacyForCard({ category: "money", prompt: "x", a: "y", b: "z", privacy: "public" })).toBe("local-only");
  });

  it("ships at least one local-only and one cloud-ok starter card", () => {
    const tags = new Set(SEED_CARDS.map((c) => tagCard(c).privacy));
    expect(tags.has("local-only")).toBe(true);
    expect(tags.has("cloud-ok")).toBe(true);
    expect(SEED_CARDS.length).toBeGreaterThanOrEqual(12);
  });
});

describe("stores split by privacy on disk", () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "jollyos-persona-")); process.env.DATA_DIR = dir; });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); delete process.env.DATA_DIR; });

  it("files a local-only answer under private/ and keeps it out of cloud-safe reads", () => {
    const money = SEED_CARDS.find((c) => c.category === "money")!;
    const open = SEED_CARDS.find((c) => c.category === "building")!;
    expect(recordAnswer({ cardId: money.id, choice: "a", ms: 900 }).ok).toBe(true);
    expect(recordAnswer({ cardId: open.id, choice: "b", ms: 1200 }).ok).toBe(true);
    expect(fs.existsSync(path.join(dir, "private", "decisions.jsonl"))).toBe(true);
    expect(readAnswers({ includePrivate: false }).map((a) => a.cardId)).toEqual([open.id]);
    expect(readAnswers({ includePrivate: true })).toHaveLength(2);
    expect(recordAnswer({ cardId: "nope", choice: "a", ms: 1 }).ok).toBe(false);
  });

  it("merges a second write for an already-answered card instead of duplicating it — the double-submit guard", () => {
    const open = SEED_CARDS.find((c) => c.category === "building")!;

    // The Decision Deck's combined depends+reason write: Enter and a
    // near-simultaneous tap on Save can both reach the server for one card.
    const first = recordAnswer({ cardId: open.id, choice: "depends", ms: 650, reason: "because the floor is down" });
    const second = recordAnswer({ cardId: open.id, choice: "depends", ms: 650, reason: "because the floor is down" });
    expect(first.ok && second.ok).toBe(true);
    expect(readAnswers({ includePrivate: true }).filter((a) => a.cardId === open.id)).toHaveLength(1);
    expect((second as { answer: DeckAnswer }).answer.reason).toBe("because the floor is down");

    // An a/b pick, then the "add a why" note (which reuses POST in this
    // repo): attaches to the existing row rather than appending.
    const open2 = SEED_CARDS.filter((c) => c.category === "building")[1]!;
    recordAnswer({ cardId: open2.id, choice: "a", ms: 400 });
    const withReason = recordAnswer({ cardId: open2.id, choice: "a", ms: 0, reason: "second thought" });
    expect(withReason.ok).toBe(true);
    expect(readAnswers({ includePrivate: true }).filter((a) => a.cardId === open2.id)).toHaveLength(1);
    expect((withReason as { answer: DeckAnswer }).answer.reason).toBe("second thought");
  });

  it("persists persona entries with their tags", () => {
    addEntry({ kind: "rule", text: "Decide fast when reversible.", privacy: "cloud-ok" });
    addEntry({ kind: "preference", text: "Budget line", privacy: "local-only" });
    const entries = readEntries();
    expect(entries).toHaveLength(2);
    expect(filterForAudience(entries, "cloud")).toHaveLength(1);
  });
});

describe("summariseSession", () => {
  it("only claims what the numbers support", () => {
    const cards = SEED_CARDS.map(tagCard);
    const speedy = cards.filter((c) => c.traitA === "speed" || c.traitB === "speed");
    const answers: DeckAnswer[] = speedy.map((c, i) => ({
      cardId: c.id, choice: c.traitA === "speed" ? "a" : "b", ms: 1500, category: c.category, privacy: c.privacy, at: `2026-01-0${i + 1}T00:00:00.000Z`,
    }));
    const r = summariseSession(answers, cards);
    expect(r.lines.some((l) => l.includes("speed over polish"))).toBe(true);
    expect(summariseSession([answers[0]], cards).lines[0]).toMatch(/Too early/);
  });
});
