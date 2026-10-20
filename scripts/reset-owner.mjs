#!/usr/bin/env node
/**
 * scripts/reset-owner.mjs — reset a locked-out owner's password, or remove the
 * owner so first-run setup appears again. Needs a shell on the machine or in
 * the container; whoever can read DATA_DIR already owns the instance, so that
 * is the whole access control.
 *
 *   npm run reset-owner                      prompt for a new password (twice, hidden)
 *   npm run reset-owner -- --stdin           read the new password from stdin (first line)
 *   npm run reset-owner -- --remove          delete the owner (asks "yes"); setup reappears
 *   npm run reset-owner -- --remove --yes    the same without the question
 *
 *   docker compose exec -it jollyos npm run reset-owner
 *   printf '%s\n' 'a new long password' | docker compose exec -T jollyos npm run reset-owner -- --stdin
 *
 * It applies the same rules as the setup page (lib/auth/rules.ts) and the
 * same scrypt hashing (lib/auth/password.ts), imported here through Node's
 * type stripping, and bumps the session epoch so every browser is signed out.
 * DATA_DIR comes from the environment, else .env in the current folder, else
 * ./data. Nothing it prints ever includes the password.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { passwordProblem } from "../lib/auth/rules.ts";
import { ownerWithPassword } from "../lib/auth/password.ts";
import { dataPath, readJson, writeJson } from "../lib/data-dir.ts";

// ── Pure parts (unit-tested in tests/auth-reset-owner.test.ts) ─────────────

export function parseArgs(argv) {
  const flags = { stdin: false, remove: false, yes: false, help: false, unknown: [] };
  for (const a of argv) {
    if (a === "--stdin") flags.stdin = true;
    else if (a === "--remove") flags.remove = true;
    else if (a === "--yes" || a === "-y") flags.yes = true;
    else if (a === "--help" || a === "-h") flags.help = true;
    else flags.unknown.push(a);
  }
  return flags;
}

/** The new owner record for a password reset, or the reason there is none. */
export function planReset(owner, password, now = new Date()) {
  if (!owner || typeof owner.username !== "string") return { ok: false, error: "No owner exists yet. Start JollyOS: the first visit shows the setup page." };
  const problem = passwordProblem(password, owner.username);
  if (problem) return { ok: false, error: problem };
  return { ok: true, record: ownerWithPassword(owner, password, now) };
}

/** Delete the owner file. Returns false when there was none. */
export function removeOwner(file) {
  if (!fs.existsSync(file)) return false;
  fs.rmSync(file);
  return true;
}

// ── I/O ─────────────────────────────────────────────────────────────────────

const usage = `Usage: npm run reset-owner [-- --stdin | --remove [--yes]]

  (no flags)   prompt for a new owner password, twice
  --stdin      read the new password from the first line of stdin
  --remove     delete the owner so the next visit shows first-run setup
  --yes        skip the confirmation for --remove
`;

async function readLine(prompt, { hidden }) {
  process.stderr.write(prompt);
  const input = process.stdin;
  if (!hidden || !input.isTTY) {
    const { createInterface } = await import("node:readline");
    return new Promise((resolve) => {
      const rl = createInterface({ input, terminal: false });
      let answered = false;
      rl.on("line", (line) => { answered = true; rl.close(); resolve(line); });
      rl.on("close", () => { if (!answered) resolve(""); });
    });
  }
  return new Promise((resolve) => {
    let value = "";
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\u0003") { process.stderr.write("\n"); process.exit(130); }
        if (ch === "\r" || ch === "\n") {
          input.setRawMode(false);
          input.pause();
          input.off("data", onData);
          process.stderr.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    input.on("data", onData);
  });
}

async function readPassword(flags) {
  if (flags.stdin) return (await readLine("", { hidden: false })).replace(/\r$/, "");
  const first = await readLine("New password: ", { hidden: true });
  const second = await readLine("Again: ", { hidden: true });
  if (first !== second) {
    console.error("The two passwords do not match. Nothing changed.");
    process.exit(1);
  }
  return first;
}

async function main() {
  try {
    process.loadEnvFile(".env"); // values already in the environment win
  } catch {
    // no .env here (Docker sets DATA_DIR in the image)
  }
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help || flags.unknown.length) {
    if (flags.unknown.length) console.error(`Unknown option: ${flags.unknown.join(" ")}\n`);
    process.stderr.write(usage);
    process.exit(flags.help ? 0 : 2);
  }
  const file = dataPath("owner.json");
  const owner = readJson(file, null);
  const where = path.dirname(file);

  if (flags.remove) {
    if (!owner) {
      console.log(`No owner in ${where}; the next visit already shows the setup page.`);
      return;
    }
    if (!flags.yes) {
      const answer = await readLine(`Remove the owner "${owner.username}" from ${where}? The next visit will show first-run setup. Type yes to continue: `, { hidden: false });
      if (answer.trim().toLowerCase() !== "yes") {
        console.log("Nothing changed.");
        process.exit(1);
      }
    }
    removeOwner(file);
    console.log(`Owner removed. Every session is signed out; the next visit shows the setup page.`);
    return;
  }

  if (!owner) {
    console.error(`No owner in ${where}. Start JollyOS: the first visit shows the setup page.`);
    process.exit(1);
  }
  const password = await readPassword(flags);
  const plan = planReset(owner, password);
  if (!plan.ok) {
    console.error(`${plan.error} Nothing changed.`);
    process.exit(1);
  }
  writeJson(file, plan.record, 0o600);
  console.log(`Password updated for "${owner.username}". Every signed-in browser is now signed out; sign in again with the new password.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
