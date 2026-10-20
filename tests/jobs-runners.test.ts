import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

// Every store write lands in a throwaway DATA_DIR; set before the store is imported.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jollyos-jobs-"));
process.env.DATA_DIR = tmp;
process.env.DEMO_MODE = "false";

const { defaultRunner } = await import("@/lib/config");
const {
  RUNNER_MANIFESTS, briefIsPrivate, captureToJob, costLabel, createJob, getJob, readJobs, resolveRunner, runnerIsCloud,
  settle, stripPrivateTag, tagPrivate, unblockJob, validateRegistry,
} = await import("@/lib/jobs/store");
const { LOCAL_UNREACHABLE, resetLocalProbe, runJob, runnerStatuses } = await import("@/lib/jobs/runners");

const NONE = { DEMO_MODE: "false", ANTHROPIC_API_KEY: "", OPENAI_API_KEY: "", LOCAL_LLM_BASE_URL: "", JOBS_DEFAULT_RUNNER: "", LLM_PROVIDER: "", JOBS_CLI: "", JOBS_CLI_CWD: path.join(tmp, "cli") };
// :9 is the discard port — closed on any box, so "unreachable" is immediate and deterministic.
const LOCAL_DOWN = { ...NONE, LOCAL_LLM_BASE_URL: "http://127.0.0.1:9/v1" };

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
beforeEach(() => { fs.rmSync(path.join(tmp, "jobs.json"), { force: true }); resetLocalProbe(); });

describe("registry", () => {
  it("every manifest is valid, local is local and free, demo exists", () => {
    expect(validateRegistry()).toEqual([]);
    expect(runnerIsCloud("api")).toBe(true);
    expect(runnerIsCloud("local")).toBe(false);
    expect(validateRegistry([...RUNNER_MANIFESTS, { ...RUNNER_MANIFESTS[0] }]).some((p) => /duplicate/.test(p))).toBe(true);
    expect(validateRegistry(RUNNER_MANIFESTS.map((m) => (m.id === "local" ? { ...m, cost: { ...m.cost, model: "metered" as const } } : m))).some((p) => /must be free/.test(p))).toBe(true);
    expect(validateRegistry(RUNNER_MANIFESTS.filter((m) => m.id !== "local")).some((p) => /local runner/.test(p))).toBe(true);
  });
  it("reports health for every runner without throwing", async () => {
    const s = await runnerStatuses(NONE);
    expect(s.map((x) => x.id).sort()).toEqual(["api", "cli", "demo", "local"]);
    expect(s.find((x) => x.id === "demo")?.ok).toBe(true);
    expect(s.find((x) => x.id === "api")?.status).toBe("needs-setup");
    expect(s.find((x) => x.id === "local")?.status).toBe("needs-setup");
  });
});

describe("Auto = the configured default", () => {
  it("JOBS_DEFAULT_RUNNER wins, else demo mode → demo, else the first configured, else demo", () => {
    expect(defaultRunner({ ...NONE, JOBS_DEFAULT_RUNNER: "local" })).toBe("local");
    expect(defaultRunner({ ...NONE, JOBS_DEFAULT_RUNNER: "nonsense" })).toBe("demo");
    expect(defaultRunner({ ...NONE, DEMO_MODE: "true", ANTHROPIC_API_KEY: "k" })).toBe("demo");
    expect(defaultRunner({ ...NONE, ANTHROPIC_API_KEY: "k", LOCAL_LLM_BASE_URL: "http://localhost:1234/v1" })).toBe("api");
    expect(defaultRunner({ ...NONE, LOCAL_LLM_BASE_URL: "http://localhost:1234/v1" })).toBe("local");
    expect(defaultRunner(NONE)).toBe("demo");
  });
  it("Auto resolves to the default; a manual pick is honoured; garbage is Auto", () => {
    expect(resolveRunner("auto", { private: false, defaultRunner: "api" }).runner).toBe("api");
    expect(resolveRunner(undefined, { private: false, defaultRunner: "demo" }).runner).toBe("demo");
    expect(resolveRunner("bogus" as never, { private: false, defaultRunner: "cli" }).runner).toBe("cli");
    expect(resolveRunner("local", { private: false, defaultRunner: "api" }).runner).toBe("local");
    expect(resolveRunner("auto", { private: false, defaultRunner: "api" }).forced).toBe(false);
  });
});

describe("the private rule", () => {
  it("Auto + private → Local; private never cloud even when a cloud runner is picked by hand", () => {
    for (const c of ["auto", "api", "cli", "demo", "local"] as const) {
      const r = resolveRunner(c, { private: true, defaultRunner: "api" });
      expect(r.runner, c).toBe("local");
      expect(runnerIsCloud(r.runner)).toBe(false);
      expect(r.forced).toBe(c !== "local");
    }
  });
  it("the tag: a PRIVACY: local-only line, idempotent tagging, stripped from the title", () => {
    expect(briefIsPrivate("Do X\nPRIVACY: local-only")).toBe(true);
    expect(briefIsPrivate("private: yes\nDo X")).toBe(true);
    expect(briefIsPrivate("talks about privacy: local-only mid-sentence")).toBe(false);
    expect(tagPrivate(tagPrivate("Do X"))).toBe("PRIVACY: local-only\nDo X");
    expect(stripPrivateTag("PRIVACY: local-only\nDo X")).toBe("Do X");
    const cap = captureToJob("PRIVACY: local-only\nTotal the receipts\nby category");
    expect(cap).toEqual({ title: "Total the receipts", brief: "by category", private: true });
    const job = createJob(cap);
    expect(job.private).toBe(true); expect(job.title).toBe("Total the receipts"); expect(job.lane).toBe("inbox");
    expect(createJob({ title: "Plain", brief: "x" }).private).toBe(false);
  });
  it("a private job with NO local server → Blocked with the reason, never run on a cloud runner", async () => {
    const job = createJob({ title: "Secret", brief: "PRIVACY: local-only\nsum it up" });
    const r = await runJob(job.id, "api", NONE);   // api picked by hand: still never cloud
    expect("job" in r).toBe(true);
    if (!("job" in r)) return;
    expect(r.resolution.runner).toBe("local"); expect(r.resolution.forced).toBe(true);
    expect(r.job.lane).toBe("blocked");
    expect(r.job.blockedReason).toContain(LOCAL_UNREACHABLE);
    expect(r.job.runner).toBeNull();
    expect(getJob(job.id)?.lane).toBe("blocked");
  });
  it("a private job with a local server that is DOWN → Blocked with the reason; Unblock → inbox; Try again stays blocked", async () => {
    const job = createJob({ title: "Secret", brief: "PRIVACY: local-only\nsum it up" });
    const r = await runJob(job.id, "auto", LOCAL_DOWN);
    expect("job" in r && r.job.lane).toBe("blocked");
    expect("job" in r && r.job.blockedReason).toContain("not sent to a cloud model");
    const back = unblockJob(job.id)!;
    expect(back.lane).toBe("inbox"); expect(back.blockedReason).toBeNull();
    resetLocalProbe();
    const again = await runJob(job.id, "auto", LOCAL_DOWN);
    expect("job" in again && again.job.lane).toBe("blocked");
  });
});

describe("running", () => {
  it("the demo runner moves a card inbox → running → done on elapsed time", async () => {
    const job = createJob({ title: "Draft the update", brief: "short" });
    const r = await runJob(job.id, "auto", NONE);
    expect("job" in r && r.job.lane).toBe("running");
    expect("job" in r && r.job.runner).toBe("demo");
    const later = settle(getJob(job.id)!, Date.now() + 60_000);
    expect(later.lane).toBe("done"); expect(later.progress).toBe(100); expect(later.output).toMatch(/Simulated run/);
    expect(readJobs().find((j) => j.id === job.id)?.lane).toBe("running");   // the real clock has not moved
  });
  it("a cloud runner that is not set up refuses with 409; an unknown runner is 400; a running card is 409", async () => {
    const job = createJob({ title: "Needs a key", brief: "x" });
    const r = await runJob(job.id, "api", NONE);
    expect("error" in r && r.status).toBe(409);
    expect("error" in r && r.error).toMatch(/needs setup/);
    const bad = await runJob(job.id, "mainframe", NONE);
    expect("error" in bad && bad.status).toBe(400);
    await runJob(job.id, "demo", NONE);
    const twice = await runJob(job.id, "demo", NONE);
    expect("error" in twice && twice.status).toBe(409);
    expect(await runJob("nope", "demo", NONE)).toEqual({ error: "No such job.", status: 404 });
  });
  it("cost labels: local and demo are $0, the rest name the plan", () => {
    expect(costLabel("local")).toBe("$0"); expect(costLabel("demo")).toBe("$0");
    expect(costLabel("api")).toBe("API credits"); expect(costLabel("cli")).toBe("your CLI plan"); expect(costLabel(null)).toBeNull();
  });
});
