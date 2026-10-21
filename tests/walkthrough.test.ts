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
import { readGoals } from "@/lib/goals/store";
import { checklistItems, checklistProgress, DECK_TARGET } from "@/lib/onboarding/checklist";
import { walkthroughEntries, walkthroughFeeds, MAX_SEEDED_FEEDS } from "@/lib/onboarding/seed";
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
import { ALL_PICKS, CATEGORIES, SENSITIVE, localOnlyTopics, pickById, searchPicks, subsOf } from "@/lib/onboarding/topics";
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
  goals: [{ area: "career" as const, want: "ship the design system", why: "it unblocks the whole team", baselineNote: "half of v1 is undocumented", obstacles: ["time"], hoursClaimed: 4 }],
  topics: ["design", "accessibility", "personal-finance"],
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
    const a = sanitiseAnswers({ interestsText: "y".repeat(5000), name: "z".repeat(500) });
    expect(a.interestsText).toHaveLength(400);
    expect(a.name).toHaveLength(60);
  });

  it("an older walkthrough.json with a free-text goals field is read, not crashed on", () => {
    fs.writeFileSync(file(), JSON.stringify({ version: 1, status: "done", stepId: "finish", answers: { name: "Alex", goals: "ship the thing" } }));
    const state = readWalkthrough();
    expect(state.answers.name).toBe("Alex");
    expect(state.answers.goals).toEqual([]);
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
    expect(entries.some((e) => e.text === "I follow design.")).toBe(true);

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

  it("goals are created for real, and replaced rather than stacked on a re-run", () => {
    const first = completeWalkthrough({ answers: ANSWERS });
    expect(first.state.seeded.goalIds).toHaveLength(1);
    expect(first.receipt.goals).toBe(1);
    expect(readGoals({ includePrivate: true })).toHaveLength(1);
    expect(readGoals({ includePrivate: true })[0].want).toBe("ship the design system");
    expect(readGoals({ includePrivate: true })[0].hoursClaimed).toBe(4);

    const second = completeWalkthrough({ answers: ANSWERS });
    expect(readGoals({ includePrivate: true })).toHaveLength(1);
    expect(second.state.seeded.goalIds).not.toEqual(first.state.seeded.goalIds);
  });

  it("a goal in a protected area is created local-only", () => {
    completeWalkthrough({ answers: { ...ANSWERS, localOnly: ["health"], goals: [{ area: "health", want: "run 5k without stopping", why: "stairs", baselineNote: "1.5k", obstacles: [], hoursClaimed: 2 }] } });
    const goal = readGoals({ includePrivate: true })[0];
    expect(goal.privacy).toBe("local-only");
    // ...and the persona line about it carries the same tag.
    expect(readEntries().find((e) => e.text.includes("run 5k"))!.privacy).toBe("local-only");
  });

  it("the same goal is cloud-ok when the area is not protected", () => {
    completeWalkthrough({ answers: { ...ANSWERS, localOnly: [], goals: [{ area: "health", want: "run 5k without stopping", why: "stairs", baselineNote: "1.5k", obstacles: [], hoursClaimed: 2 }] } });
    expect(readGoals({ includePrivate: true })[0].privacy).toBe("cloud-ok");
  });

  it("an empty goal is not created", () => {
    completeWalkthrough({ answers: { ...ANSWERS, goals: [{ area: "career", want: "   ", why: "", baselineNote: "", obstacles: [], hoursClaimed: 2 }] } });
    expect(readGoals({ includePrivate: true })).toHaveLength(0);
  });

  it("restart removes the goals it created too", () => {
    completeWalkthrough({ answers: ANSWERS });
    restartWalkthrough();
    expect(readGoals({ includePrivate: true })).toHaveLength(0);
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
  it("one entry per answered field, in catalog order", () => {
    const texts = walkthroughEntries({ ...ANSWERS, brain: "none" }).map((e) => e.text);
    expect(texts).toEqual([
      "Call me Alex.",
      "What I do: product designer at a two-person studio.",
      "Right now I am working on: ship the design system.",
      "I follow design.",
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
});

describe("the screens", () => {
  it("has exactly eight, with a distinct id each", () => {
    expect(STEPS).toHaveLength(8);
    expect(new Set(STEPS.map((s) => s.id)).size).toBe(8);
    // Goals sit right after "about": who you are, then what you are chasing.
    expect(STEPS.map((s) => s.id)).toEqual(["what", "about", "goals", "interests", "style", "privacy", "brain", "finish"]);
  });
});

describe("the topic catalog", () => {
  it("is big enough to be specific, and every id is unique", () => {
    expect(CATEGORIES.length).toBeGreaterThanOrEqual(15);
    expect(ALL_PICKS.length).toBeGreaterThanOrEqual(150);
    expect(new Set(ALL_PICKS.map((p) => p.id)).size).toBe(ALL_PICKS.length);
  });

  it("every pick's own entry derives an interest — a label the deriver cannot lift back out is a silent no-op", () => {
    const dead: string[] = [];
    for (const pick of ALL_PICKS) {
      const entries = walkthroughEntries({ ...DEFAULT_ANSWERS, localOnly: [], topics: [pick.id] });
      const profile = deriveInterests(entries.map((e, i) => ({ id: String(i), text: e.text, privacy: e.privacy })));
      if (!profile.interests.length) dead.push(`${pick.label} (${pick.id})`);
    }
    expect(dead, `these picks derive nothing: ${dead.join(", ")}`).toEqual([]);
  });

  it("every label stays inside what the deriver can extract: <= 3 words, starts alphanumeric", () => {
    for (const pick of ALL_PICKS) {
      expect(pick.label.split(" ").length, pick.id).toBeLessThanOrEqual(3);
      expect(pick.label, pick.id).toMatch(/^[A-Za-z0-9]/);
    }
  });

  it("every topic id a pick claims is a real interest topic", () => {
    const known = new Set(TOPICS.map((t) => t.id));
    for (const pick of ALL_PICKS) {
      for (const topic of pick.topics ?? []) expect(known, `${pick.id} -> ${topic}`).toContain(topic);
    }
  });

  it("every feed id a pick claims exists in the shipped catalog", () => {
    const known = new Set(catalog.feeds.map((f) => f.id));
    for (const pick of ALL_PICKS) {
      for (const feedId of pick.feeds ?? []) expect(known, `${pick.id} -> ${feedId}`).toContain(feedId);
    }
  });

  it("broad chips reveal specific sub-picks, and a sub knows its parent", () => {
    const subs = subsOf("motorsport");
    expect(subs.map((s) => s.id)).toContain("f1");
    expect(subs.map((s) => s.id)).toContain("wec");
    expect(pickById("f1")!.parentLabel).toBe("Motorsport");
    expect(pickById("f1")!.categoryLabel).toBe("Cars & motorsport");
    // A broad chip has no parent, so the two can be told apart when seeding.
    expect(pickById("motorsport")!.parentId).toBeUndefined();
  });

  it("there are plenty of sub-picks, not just a renamed flat list", () => {
    expect(ALL_PICKS.filter((p) => p.parentId).length).toBeGreaterThanOrEqual(90);
  });
});

describe("searching the catalog", () => {
  it("finds a sub-pick by its synonym and reports where it lives", () => {
    const hit = searchPicks("f1")[0];
    expect(hit.id).toBe("f1");
    expect(hit.categoryLabel).toBe("Cars & motorsport");
    expect(hit.parentLabel).toBe("Motorsport");
  });

  it("an exact label beats a mere substring", () => {
    expect(searchPicks("yoga")[0].id).toBe("yoga");
    expect(searchPicks("sourdough")[0].id).toBe("sourdough");
  });

  it("a category word pulls in the whole family", () => {
    const ids = searchPicks("racing").map((p) => p.id);
    expect(ids).toContain("motorsport");
    expect(ids.length).toBeGreaterThan(3);
  });

  it("ignores a one-character query and returns nothing for nonsense", () => {
    expect(searchPicks("f")).toEqual([]);
    expect(searchPicks("zzzzqqq")).toEqual([]);
  });

  it("never returns more than the limit", () => {
    expect(searchPicks("a", 5).length).toBeLessThanOrEqual(5);
    expect(searchPicks("ing", 5).length).toBeLessThanOrEqual(5);
  });
});

describe("which feeds a selection subscribes to", () => {
  it("prefers the specific sub-pick over the broad chip above it", () => {
    const answers = { ...DEFAULT_ANSWERS, topics: ["motorsport", "f1"] };
    const urls = walkthroughFeeds(answers, catalog.feeds).map((f) => f.id);
    // Formula 1's own feeds come first; Motorsport's generic feed is deduped away.
    expect(urls[0]).toBe("msf1");
    expect(urls).toContain("autosportf1");
  });

  it("caps the list however many topics were tapped, and never repeats a feed", () => {
    const answers = { ...DEFAULT_ANSWERS, topics: ALL_PICKS.map((p) => p.id) };
    const feeds = walkthroughFeeds(answers, catalog.feeds);
    expect(feeds).toHaveLength(MAX_SEEDED_FEEDS);
    expect(new Set(feeds.map((f) => f.id)).size).toBe(feeds.length);
  });

  it("is deterministic", () => {
    const answers = { ...DEFAULT_ANSWERS, topics: ["f1", "sourdough", "bouldering"] };
    expect(walkthroughFeeds(answers, catalog.feeds).map((f) => f.id))
      .toEqual(walkthroughFeeds(answers, catalog.feeds).map((f) => f.id));
  });

  it("a pick with no feed of its own subscribes to nothing but still seeds the persona", () => {
    const answers = { ...DEFAULT_ANSWERS, topics: ["local-news", "karting"] };
    expect(walkthroughFeeds(answers, catalog.feeds)).toEqual([]);
    expect(walkthroughEntries({ ...answers, brain: "none", localOnly: [] }).map((e) => e.text))
      .toEqual(["I follow karting.", "I follow local news.", ...["Keep my brief short: at most 3 bullets per section.", "Write to me in a direct tone: no filler, no preamble, lead with the action.", "My morning block starts at 07:00."]]);
  });

  it("every feed-mapped pick resolves to at least one real feed", () => {
    for (const pick of ALL_PICKS) {
      if (!pick.feeds?.length) continue;
      const feeds = walkthroughFeeds({ ...DEFAULT_ANSWERS, topics: [pick.id] }, catalog.feeds);
      expect(feeds.length, `${pick.id} maps to no working feed`).toBeGreaterThan(0);
    }
  });
});

describe("privacy still works across the bigger catalog", () => {
  it("a category-level tag reaches every pick inside it", () => {
    expect(pickById("personal-finance")!.sensitiveId).toBe("finance");
    expect(pickById("index-funds")!.sensitiveId).toBe("finance");
    expect(pickById("strength-training")!.sensitiveId).toBe("health");
    expect(pickById("local-news")!.sensitiveId).toBe("location");
    expect(pickById("f1")!.sensitiveId).toBeUndefined();
  });

  it("a pick can override its category (parenting is family, not health)", () => {
    expect(pickById("parenting")!.sensitiveId).toBe("family");
  });

  it("all four protected categories map onto real topics", () => {
    for (const cat of SENSITIVE) {
      expect(localOnlyTopics([cat.id]).size, `${cat.id} protects nothing`).toBeGreaterThan(0);
    }
  });

  it("a protected sub-pick is written local-only, an unprotected one is not", () => {
    const entries = walkthroughEntries({ ...DEFAULT_ANSWERS, topics: ["index-funds", "f1"], localOnly: ["finance"], brain: "none" });
    expect(entries.find((e) => e.text.includes("index funds"))!.privacy).toBe("local-only");
    expect(entries.find((e) => e.text.includes("formula 1"))!.privacy).toBe("cloud-ok");
  });
});

describe("the getting started checklist", () => {
  const base = { walkthroughFinished: false, jobs: 0, briefBuilt: false, deckAnswers: 0, imports: 0, goals: 0, checkIns: 0 };

  it("ticks off from real state, not from a stored flag", () => {
    const empty = checklistItems(base);
    expect(checklistProgress(empty)).toEqual({ done: 0, total: 7, complete: false });

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
    const all = checklistItems({ walkthroughFinished: true, jobs: 1, briefBuilt: true, deckAnswers: DECK_TARGET, imports: 1, goals: 1, checkIns: 1 });
    expect(checklistProgress(all).complete).toBe(true);
  });

  it("dismissal is stored in DATA_DIR and is reversible", () => {
    expect(readWalkthrough().checklistDismissedAt).toBeNull();
    expect(dismissChecklist(true).checklistDismissedAt).toBeTruthy();
    expect(readWalkthrough().checklistDismissedAt).toBeTruthy();
    expect(dismissChecklist(false).checklistDismissedAt).toBeNull();
  });
});
