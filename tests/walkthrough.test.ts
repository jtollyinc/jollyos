/**
 * The welcome walkthrough: what it persists, what it seeds, and what a re-run
 * does. Everything here runs against a real temp DATA_DIR, because the point of
 * the feature is that progress survives a reload on another device — an
 * in-memory stub would prove nothing.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readAcceptedFeeds } from "@/lib/brief/feeds-store";
import { checklistItems, checklistProgress, DECK_TARGET } from "@/lib/onboarding/checklist";
import { chosenLabels, walkthroughEntries, walkthroughFeeds, MAX_SEEDED_FEEDS } from "@/lib/onboarding/seed";
import { FIRST_STEP, LAST_STEP, STEPS } from "@/lib/onboarding/steps";
import {
  completeWalkthrough,
  dismissChecklist,
  patchWalkthrough,
  readWalkthrough,
  restartWalkthrough,
  sanitiseAnswers,
  skipWalkthrough,
  walkthroughFinished,
  walkthroughStarted,
} from "@/lib/onboarding/store";
import { SENSITIVE, TOPIC_CHIPS, localOnlyTopics } from "@/lib/onboarding/topics";
import { DEFAULT_ANSWERS } from "@/lib/onboarding/types";
import { deriveInterests, TOPICS } from "@/lib/persona/interests";
import { readInterests } from "@/lib/persona/interests-store";
import { addEntry, readEntries } from "@/lib/persona/store";
import catalog from "@/lib/brief/feed-catalog.json";

let dir: string;
const file = () => path.join(dir, "walkthrough.json");

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "jollyos-welcome-"));
  process.env.DATA_DIR = dir;
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

const ANSWERS = {
  name: "Alex",
  role: "product designer at a two-person studio",
  goals: "ship the design system and stop losing my mornings",
  topics: ["design", "accessibility", "money"],
  interestsText: "espresso gear",
  briefLength: "short" as const,
  tone: "direct" as const,
  morningTime: "07:30",
  localOnly: ["finance", "health", "family", "location"],
};

describe("walkthrough persistence", () => {
  it("starts with nothing on disk and reads as new", () => {
    expect(walkthroughStarted()).toBe(false);
    const state = readWalkthrough();
    expect(state.status).toBe("new");
    expect(state.stepId).toBe(FIRST_STEP);
    expect(state.answers).toEqual(DEFAULT_ANSWERS);
    expect(walkthroughFinished(state)).toBe(false);
  });

  it("saves progress to DATA_DIR and resumes at the step it left off", () => {
    patchWalkthrough({ stepId: "interests", answers: { name: "Alex" } });
    expect(fs.existsSync(file())).toBe(true);
    const resumed = readWalkthrough();
    expect(resumed.status).toBe("in-progress");
    expect(resumed.stepId).toBe("interests");
    expect(resumed.answers.name).toBe("Alex");
    // Untouched answers keep their defaults, not undefined.
    expect(resumed.answers.briefLength).toBe(DEFAULT_ANSWERS.briefLength);
    expect(resumed.startedAt).toBeTruthy();
  });

  it("merges one step's answers without losing an earlier step's", () => {
    patchWalkthrough({ stepId: "about", answers: { name: "Alex" } });
    patchWalkthrough({ stepId: "interests", answers: { topics: ["design"] } });
    const state = readWalkthrough();
    expect(state.answers.name).toBe("Alex");
    expect(state.answers.topics).toEqual(["design"]);
  });

  it("skip is recorded as a decision and seeds nothing", () => {
    patchWalkthrough({ stepId: "about", answers: { name: "Alex" } });
    const state = skipWalkthrough();
    expect(state.status).toBe("skipped");
    expect(walkthroughFinished(state)).toBe(true);
    expect(readEntries()).toHaveLength(0);
    expect(readAcceptedFeeds()).toHaveLength(0);
    // The answers survive a skip, so picking it up again is not a restart.
    expect(readWalkthrough().answers.name).toBe("Alex");
  });

  it("rejects junk from the browser instead of storing it", () => {
    patchWalkthrough({
      stepId: "no-such-step",
      answers: { name: 42, topics: ["design", "not-a-chip", 7], localOnly: ["finance", "nonsense"], morningTime: "99:99", tone: "shouty", briefLength: "epic" },
    });
    const a = readWalkthrough().answers;
    expect(readWalkthrough().stepId).toBe(FIRST_STEP);
    expect(a.name).toBe("");
    expect(a.topics).toEqual(["design"]);
    expect(a.localOnly).toEqual(["finance"]);
    expect(a.morningTime).toBe(DEFAULT_ANSWERS.morningTime);
    expect(a.tone).toBe(DEFAULT_ANSWERS.tone);
    expect(a.briefLength).toBe(DEFAULT_ANSWERS.briefLength);
  });

  it("caps long free text instead of writing a novel into the persona", () => {
    const a = sanitiseAnswers({ goals: "x".repeat(5000), interestsText: "y".repeat(5000), name: "z".repeat(500) });
    expect(a.goals).toHaveLength(400);
    expect(a.interestsText).toHaveLength(400);
    expect(a.name).toHaveLength(60);
  });

  it("survives a corrupt file rather than throwing", () => {
    fs.writeFileSync(file(), "{not json");
    expect(readWalkthrough().status).toBe("new");
  });
});

describe("finishing the walkthrough", () => {
  it("writes persona entries, subscribes feeds, derives interests and marks itself done", () => {
    const { state, receipt } = completeWalkthrough({ answers: ANSWERS });
    expect(state.status).toBe("done");
    expect(state.stepId).toBe(LAST_STEP);
    expect(state.completedAt).toBeTruthy();

    const entries = readEntries();
    expect(entries.length).toBe(receipt.entries);
    expect(entries.map((e) => e.text)).toContain("Call me Alex.");
    expect(entries.some((e) => e.text.includes("design & ux"))).toBe(true);

    const feeds = readAcceptedFeeds();
    expect(feeds.length).toBeGreaterThan(0);
    expect(feeds.length).toBeLessThanOrEqual(MAX_SEEDED_FEEDS);
    expect(feeds.every((f) => f.enabled !== false)).toBe(true);
    expect(receipt.feeds.map((f) => f.url).sort()).toEqual(feeds.map((f) => f.url).sort());

    // The Brief's personalisation comes from the derived profile, not a special case.
    const profile = readInterests();
    expect(profile.version).not.toBe("none");
    expect(profile.interests.map((i) => i.topic)).toContain("accessibility");
  });

  it("maps a protected category onto a local-only interest, so the router withholds it", () => {
    completeWalkthrough({ answers: ANSWERS });
    const finance = readInterests().interests.find((i) => i.topic === "personal-finance");
    expect(finance?.privacy).toBe("local-only");
    const design = readInterests().interests.find((i) => i.topic === "design-systems");
    expect(design?.privacy).toBe("cloud-ok");
  });

  it("un-protecting a category makes that interest shareable again", () => {
    completeWalkthrough({ answers: { ...ANSWERS, localOnly: ["health"] } });
    expect(readInterests().interests.find((i) => i.topic === "personal-finance")?.privacy).toBe("cloud-ok");
    expect(readEntries().filter((e) => e.privacy === "local-only")).toHaveLength(1);
  });

  it("writes one local-only rule per protected category", () => {
    completeWalkthrough({ answers: ANSWERS });
    const rules = readEntries().filter((e) => e.kind === "rule");
    expect(rules).toHaveLength(SENSITIVE.length);
    expect(rules.every((r) => r.privacy === "local-only")).toBe(true);
  });
});

describe("re-running it", () => {
  it("replaces what it seeded instead of duplicating it, and leaves hand-written entries alone", () => {
    const mine = addEntry({ kind: "value", text: "Quality first, then learning, then cost.", privacy: "public" });
    const first = completeWalkthrough({ answers: ANSWERS });
    const seededFirst = first.state.seeded.entryIds.length;
    expect(readEntries()).toHaveLength(seededFirst + 1);

    const second = completeWalkthrough({ answers: ANSWERS });
    expect(readEntries()).toHaveLength(second.state.seeded.entryIds.length + 1);
    expect(readEntries().some((e) => e.id === mine.id)).toBe(true);
    expect(readEntries().filter((e) => e.text === "Call me Alex.")).toHaveLength(1);
    expect(second.state.seeded.entryIds).not.toEqual(first.state.seeded.entryIds);
  });

  it("drops a feed the new answers no longer imply, and keeps one the owner added by hand", () => {
    completeWalkthrough({ answers: ANSWERS });
    const before = readAcceptedFeeds().map((f) => f.url);
    expect(before.some((u) => u.includes("mrmoneymustache"))).toBe(true);

    completeWalkthrough({ answers: { ...ANSWERS, topics: ["accessibility"] } });
    const after = readAcceptedFeeds().map((f) => f.url);
    expect(after.some((u) => u.includes("mrmoneymustache"))).toBe(false);
    expect(after.length).toBeGreaterThan(0);
  });

  it("restart clears the answers, removes the seeded state and goes back to step one", () => {
    completeWalkthrough({ answers: ANSWERS });
    const state = restartWalkthrough();
    expect(state.stepId).toBe(FIRST_STEP);
    expect(state.status).toBe("in-progress");
    expect(state.answers).toEqual(DEFAULT_ANSWERS);
    expect(state.seeded.entryIds).toEqual([]);
    expect(readEntries()).toHaveLength(0);
    expect(readAcceptedFeeds()).toHaveLength(0);
  });

  it("restart keeps a dismissed checklist dismissed", () => {
    dismissChecklist(true);
    expect(restartWalkthrough().checklistDismissedAt).toBeTruthy();
  });
});

describe("what each step seeds (pure)", () => {
  it("one entry per answered field, in a stable order", () => {
    const texts = walkthroughEntries({ ...ANSWERS, brain: "none" }).map((e) => e.text);
    expect(texts).toEqual([
      "Call me Alex.",
      "What I do: product designer at a two-person studio.",
      "Right now I am focused on: ship the design system and stop losing my mornings.",
      "I follow design & ux.",
      "I follow accessibility.",
      "I follow personal finance.",
      "I am into espresso gear.",
      "Keep my brief short: at most 3 bullets per section.",
      "Write to me in a direct tone: no filler, no preamble, lead with the action.",
      "My morning block starts at 07:30.",
      "Anything about my money — pay, bills, savings, what things cost — stays on this machine.",
      "Anything about my health — symptoms, medication, how I am doing — stays on this machine.",
      "Anything about the people in my life — family, friends, colleagues — stays on this machine.",
      "Anything about where I live or travel stays on this machine.",
    ]);
  });

  it("skipping every question seeds only the defaults, never an empty entry", () => {
    const entries = walkthroughEntries({ ...DEFAULT_ANSWERS, brain: "none" });
    expect(entries.every((e) => e.text.trim().length > 0)).toBe(true);
    expect(entries.some((e) => e.text.startsWith("Call me"))).toBe(false);
    expect(entries.filter((e) => e.kind === "rule")).toHaveLength(SENSITIVE.length);
  });

  it("picks at most six feeds, deterministically", () => {
    const answers = { ...DEFAULT_ANSWERS, topics: TOPIC_CHIPS.map((c) => c.id) };
    const a = walkthroughFeeds(answers, catalog.feeds);
    const b = walkthroughFeeds(answers, catalog.feeds);
    expect(a).toHaveLength(MAX_SEEDED_FEEDS);
    expect(a.map((f) => f.url)).toEqual(b.map((f) => f.url));
    expect(new Set(a.map((f) => f.url)).size).toBe(a.length);
  });

  it("every topic chip can produce at least one feed, so a chip can never give an empty Brief", () => {
    for (const chip of TOPIC_CHIPS) {
      const feeds = walkthroughFeeds({ ...DEFAULT_ANSWERS, topics: [chip.id] }, catalog.feeds);
      expect(feeds.length, `${chip.id} has no feed in lib/brief/feed-catalog.json`).toBeGreaterThan(0);
    }
  });

  it("every chip's own entry derives one of its topics (a chip whose label matches no keyword is a silent no-op)", () => {
    for (const chip of TOPIC_CHIPS) {
      const entries = walkthroughEntries({ ...DEFAULT_ANSWERS, localOnly: [], topics: [chip.id] });
      const profile = deriveInterests(entries.map((e, i) => ({ id: String(i), text: e.text, privacy: e.privacy })));
      const derived = profile.interests.map((i) => i.topic);
      expect(chip.topics.some((t) => derived.includes(t)), `"${chip.label}" derived ${JSON.stringify(derived)}`).toBe(true);
    }
  });

  it("every chip points at real interest topics", () => {
    const known = new Set(TOPICS.map((t) => t.id));
    for (const chip of TOPIC_CHIPS) {
      for (const topic of chip.topics) expect(known, `${chip.id} -> ${topic}`).toContain(topic);
    }
  });

  it("the sensitive map only touches chips that declare a category", () => {
    expect([...localOnlyTopics(["finance"])]).toEqual(["personal-finance"]);
    expect([...localOnlyTopics([])]).toEqual([]);
  });

  it("chosenLabels reads back what was tapped", () => {
    expect(chosenLabels({ ...DEFAULT_ANSWERS, topics: ["accessibility", "design"] })).toEqual(["Design & UX", "Accessibility"]);
  });

  it("has exactly seven screens and a distinct id each", () => {
    expect(STEPS).toHaveLength(7);
    expect(new Set(STEPS.map((s) => s.id)).size).toBe(7);
  });
});

describe("the getting started checklist", () => {
  const base = { walkthroughFinished: false, jobs: 0, briefBuilt: false, deckAnswers: 0, imports: 0 };

  it("ticks off from real state, not from a stored flag", () => {
    const empty = checklistItems(base);
    expect(checklistProgress(empty)).toEqual({ done: 0, total: 5, complete: false });

    const some = checklistItems({ ...base, walkthroughFinished: true, jobs: 2, briefBuilt: true });
    expect(checklistProgress(some).done).toBe(3);
    expect(some.find((i) => i.id === "job")!.done).toBe(true);
  });

  it("the deck row needs the whole target, not one swipe", () => {
    expect(checklistItems({ ...base, deckAnswers: DECK_TARGET - 1 }).find((i) => i.id === "deck")!.done).toBe(false);
    expect(checklistItems({ ...base, deckAnswers: DECK_TARGET }).find((i) => i.id === "deck")!.done).toBe(true);
  });

  it("puts what is left first", () => {
    const items = checklistItems({ ...base, walkthroughFinished: true });
    expect(items[0].done).toBe(false);
    expect(items[items.length - 1].id).toBe("walkthrough");
  });

  it("is complete only when every row is", () => {
    const all = checklistItems({ walkthroughFinished: true, jobs: 1, briefBuilt: true, deckAnswers: DECK_TARGET, imports: 1 });
    expect(checklistProgress(all).complete).toBe(true);
  });

  it("dismissal is stored in DATA_DIR and is reversible", () => {
    expect(readWalkthrough().checklistDismissedAt).toBeNull();
    expect(dismissChecklist(true).checklistDismissedAt).toBeTruthy();
    expect(readWalkthrough().checklistDismissedAt).toBeTruthy();
    expect(dismissChecklist(false).checklistDismissedAt).toBeNull();
  });
});
