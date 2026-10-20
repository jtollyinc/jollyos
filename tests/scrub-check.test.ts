import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = path.resolve("scripts/scrub-check.sh");
const TERMS = path.resolve("scripts/scrub-terms.txt");

/** The first banned term, read at runtime so this test file never contains it. */
function firstTerm(): string {
  return fs.readFileSync(TERMS, "utf8").split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("#"))!;
}

function run(cwd: string, args: string[] = []) {
  const r = spawnSync("bash", [SCRIPT, ...args], { cwd, encoding: "utf8" });
  return { status: r.status, out: r.stdout + r.stderr };
}

function git(cwd: string, ...args: string[]) {
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { cwd, stdio: "pipe" });
}

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "jollyos-scrub-"));
  git(dir, "init", "-q", "-b", "main");
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("scrub-check.sh", () => {
  it("passes a clean tree and clean history", () => {
    fs.writeFileSync(path.join(dir, "ok.md"), "Contact: team@example.com, bind 127.0.0.1 or 0.0.0.0, see localhost.\n");
    git(dir, "add", ".");
    git(dir, "commit", "-q", "-m", "clean commit");
    const r = run(dir, ["--history"]);
    expect(r.out).toContain("clean");
    expect(r.status).toBe(0);
  });

  it("reports file:line TERM for a banned term in the working tree without echoing the line", () => {
    const term = firstTerm();
    fs.writeFileSync(path.join(dir, "notes.txt"), `line one\nthe secret is ${term.toUpperCase()} here\n`);
    const r = run(dir);
    expect(r.status).toBe(1);
    expect(r.out).toContain(`notes.txt:2 ${term}`);
    expect(r.out).not.toContain("the secret is");
  });

  it("flags emails, phone numbers and IPs that are not allowlisted", () => {
    // Built at runtime so this file itself stays clean under the working-tree scan.
    const email = ["someone", "private-host.net"].join("@");
    const phone = ["555", "867", "5309"].join("-");
    const ip = [192, 168, 4, 20].join(".");
    fs.writeFileSync(path.join(dir, "contact.txt"), `mail ${email}\ncall ${phone}\nhost ${ip}\n`);
    const r = run(dir);
    expect(r.status).toBe(1);
    expect(r.out).toContain("contact.txt:1 EMAIL");
    expect(r.out).toContain("contact.txt:2 PHONE");
    expect(r.out).toContain("contact.txt:3 IPV4");
  });

  it("finds a term that was committed and later removed when scanning history", () => {
    const term = firstTerm();
    fs.writeFileSync(path.join(dir, "a.txt"), `${term}\n`);
    git(dir, "add", ".");
    git(dir, "commit", "-q", "-m", "add");
    fs.writeFileSync(path.join(dir, "a.txt"), "nothing to see\n");
    git(dir, "commit", "-q", "-am", "remove");
    expect(run(dir).status).toBe(0);
    const r = run(dir, ["--history"]);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(new RegExp(`history [0-9a-f]+:a.txt ${term}`));
  });

  it("flags a banned term in a commit message", () => {
    fs.writeFileSync(path.join(dir, "a.txt"), "fine\n");
    git(dir, "add", ".");
    git(dir, "commit", "-q", "-m", `mention ${firstTerm()} in the message`);
    const r = run(dir, ["--history"]);
    expect(r.status).toBe(1);
    expect(r.out).toContain("(commit message)");
  });
});
