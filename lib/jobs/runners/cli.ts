/**
 * Runner: cli — an agent CLI already on this machine (Codex or Claude Code),
 * detected on PATH. The brief goes in on stdin, the CLI works in JOBS_CLI_CWD
 * (default DATA_DIR/cli-workspace) and its final message becomes the output.
 * The process runs detached from the request; the card shows the last log
 * lines while it works. Never runs a private job (the registry routes those
 * to Local). Shows "needs setup" when neither CLI is installed.
 */
import { execFile, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { dataPath } from "@/lib/data-dir";
import type { Env } from "@/lib/config";
import { appendLog, getJob, runHandles, runnerManifest, updateJob } from "../store";
import type { Runner, RunnerHealth } from "./runner";

type Cli = { bin: "codex" | "claude"; version: string };
let detected: { at: number; cli: Cli | null } | null = null;
const TTL_MS = 60_000;

function version(bin: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(bin, ["--version"], { timeout: 8_000 }, (err, stdout) => resolve(err ? null : String(stdout).trim().split("\n")[0] || bin));
  });
}

/** Which CLI would run a job: JOBS_CLI picks one; else codex, else claude. Cached a minute. */
export async function detectCli(env: Env = process.env, force = false): Promise<Cli | null> {
  if (!force && detected && Date.now() - detected.at < TTL_MS) return detected.cli;
  const order = ((env.JOBS_CLI ?? "").trim().toLowerCase() === "claude" ? ["claude", "codex"] : ["codex", "claude"]) as ("codex" | "claude")[];
  let cli: Cli | null = null;
  for (const bin of order) {
    const v = await version(bin);
    if (v) { cli = { bin, version: v }; break; }
  }
  detected = { at: Date.now(), cli };
  return cli;
}

function workspace(env: Env): string {
  const dir = (env.JOBS_CLI_CWD ?? "").trim() || dataPath("cli-workspace");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export const cliRunner: Runner = {
  manifest: runnerManifest("cli")!,
  async health(env = process.env): Promise<RunnerHealth> {
    const cli = await detectCli(env);
    return cli
      ? { ok: true, status: "ready", detail: `${cli.version} · works in ${workspace(env)}`, model: cli.version }
      : { ok: false, status: "needs-setup", detail: "No agent CLI on PATH — install and sign in to `codex` or `claude`.", model: null };
  },
  async start(job, env = process.env) {
    if (job.private) return updateJob(job.id, { lane: "failed", error: "A private job may not use the CLI runner." }) ?? job;
    const cli = await detectCli(env);
    if (!cli) return updateJob(job.id, { lane: "failed", error: "No agent CLI on PATH (codex or claude)." }) ?? job;
    const cwd = workspace(env);
    const brief = `${job.title}\n\n${job.brief}\n\nWhen done, end with one line starting with "SUMMARY:".`.trim();
    const lastFile = path.join(cwd, `.job-${job.id}.last.txt`);
    const args = cli.bin === "codex"
      ? ["exec", "--skip-git-repo-check", "--sandbox", "workspace-write", "-C", cwd, "--output-last-message", lastFile, "-"]
      : ["-p", "--permission-mode", "acceptEdits", "--output-format", "text"];
    const startedAt = new Date().toISOString();
    updateJob(job.id, { lane: "running", runner: "cli", progress: 5, error: null, blockedReason: null, startedAt, finishedAt: null, model: cli.version });
    appendLog(job.id, `Started ${cli.version} in ${cwd}.`);
    let child: ChildProcess;
    try {
      child = spawn(cli.bin, args, { cwd, env: { ...process.env, ...Object.fromEntries(Object.entries(env).filter(([, v]) => v != null)) } as NodeJS.ProcessEnv, stdio: ["pipe", "pipe", "pipe"] });
    } catch (err) {
      return updateJob(job.id, { lane: "failed", error: `Could not start ${cli.bin}: ${(err as Error).message}` }) ?? job;
    }
    const timeoutMs = (Number(env.JOBS_CLI_TIMEOUT_SEC) || 1800) * 1000;
    const timer = setTimeout(() => { appendLog(job.id, `Timed out after ${timeoutMs / 1000}s — stopping.`); child.kill("SIGTERM"); }, timeoutMs);
    runHandles().set(job.id, { kill: () => { clearTimeout(timer); child.kill("SIGTERM"); } });
    let out = "", err = "", lines = 0;
    child.stdout?.on("data", (c: Buffer) => { out += c.toString(); if (++lines % 20 === 0) { const l = out.trim().split("\n").at(-1) ?? ""; if (l) appendLog(job.id, l.slice(0, 160)); } });
    child.stderr?.on("data", (c: Buffer) => { err += c.toString(); });
    child.on("error", (e) => { clearTimeout(timer); runHandles().delete(job.id); appendLog(job.id, `Failed: ${e.message}`); updateJob(job.id, { lane: "failed", progress: 0, error: e.message, finishedAt: new Date().toISOString() }); });
    child.on("close", (code) => {
      clearTimeout(timer); runHandles().delete(job.id);
      let answer = "";
      try { answer = fs.readFileSync(lastFile, "utf8").trim(); fs.rmSync(lastFile, { force: true }); } catch { /* claude: stdout is the answer */ }
      if (!answer) answer = out.trim();
      if (code === 0 && answer) {
        appendLog(job.id, `${cli.bin} finished.`);
        updateJob(job.id, { lane: "done", progress: 100, output: answer.slice(0, 20_000), finishedAt: new Date().toISOString() });
      } else {
        const why = (err.trim().split("\n").at(-1) ?? "").slice(0, 300) || `${cli.bin} exited with code ${code}`;
        appendLog(job.id, `Failed: ${why}`);
        updateJob(job.id, { lane: "failed", progress: 0, error: why, output: answer ? answer.slice(0, 20_000) : null, finishedAt: new Date().toISOString() });
      }
    });
    child.stdin?.end(brief);
    return getJob(job.id) ?? job;
  },
};
