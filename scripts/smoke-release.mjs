#!/usr/bin/env node
/**
 * scripts/smoke-release.mjs — prove an unzipped release actually starts.
 * ────────────────────────────────────────────────────────────────────────────
 * Run BY the bundled runtime inside an extracted zip, so the whole chain is
 * what a user gets: the official Node build for this OS, the double-click
 * launcher for this OS, the standalone server, the first-run setup page.
 *
 *   unzip jollyos-0.1.0-linux-x64.zip
 *   ./JollyOS/runtime/bin/node scripts/smoke-release.mjs ./JollyOS
 *
 * Usage: <bundled node> smoke-release.mjs [folder]   (default: this folder)
 * It starts the launcher with JOLLYOS_NO_BROWSER=1, reads the port out of the
 * banner, asserts the setup page answers 200, then stops it and asserts the
 * port goes quiet. Exit code 0 means the zip is shippable.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || ".");
const START_TIMEOUT_MS = 180_000;
const STOP_TIMEOUT_MS = 30_000;

function fail(message) {
  console.error(`SMOKE FAIL: ${message}`);
  process.exit(1);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The launcher a user would double-click on this OS. */
function launcherCommand() {
  if (process.platform === "win32") {
    const cmd = path.join(root, "Start JollyOS.cmd");
    if (!fs.existsSync(cmd)) fail(`no "Start JollyOS.cmd" in ${root}`);
    // shell: true makes Node run `cmd.exe /d /s /c "<command>"`, so the path
    // has to arrive already quoted — the folder name contains a space.
    return [`"${cmd}"`, [], { shell: true }];
  }
  const unix = process.platform === "darwin" ? "Start JollyOS.command" : "start-jollyos.sh";
  const script = path.join(root, unix);
  if (!fs.existsSync(script)) fail(`no "${unix}" in ${root}`);
  try {
    fs.accessSync(script, fs.constants.X_OK);
  } catch {
    fail(`"${unix}" is not executable — the zip lost its permission bits`);
  }
  return [script, [], {}];
}

/** Kill the launcher and everything it started (the server is a grandchild). */
function killTree(child) {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-child.pid, "SIGTERM"); // the whole process group
    } catch {
      try {
        child.kill("SIGTERM");
      } catch {
        // already gone
      }
    }
  }
}

async function main() {
  const [command, args, extra] = launcherCommand();
  console.log(`smoke: starting ${command}`);
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, JOLLYOS_NO_BROWSER: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32", // own process group, so one kill stops both
    ...extra,
  });

  let output = "";
  const collect = (chunk) => {
    const text = chunk.toString();
    output += text;
    process.stdout.write(text);
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  let exited = null;
  child.on("exit", (code, signal) => {
    exited = signal ?? `code ${code}`;
  });

  const deadline = Date.now() + START_TIMEOUT_MS;
  let url = null;
  while (Date.now() < deadline && !url) {
    const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
    if (match && /JollyOS is running/.test(output)) url = match[0];
    else if (exited) fail(`the launcher exited before it was ready (${exited})`);
    else await sleep(500);
  }
  if (!url) {
    killTree(child);
    fail(`no "JollyOS is running" banner within ${START_TIMEOUT_MS / 1000}s`);
  }
  const port = Number(new URL(url).port);

  // The real check: the page a first-time user lands on.
  let response;
  try {
    response = await fetch(`${url}/`, { redirect: "follow" });
  } catch (error) {
    killTree(child);
    fail(`GET ${url}/ threw: ${error.message}`);
  }
  const body = await response.text();
  console.log(`smoke: GET ${url}/ -> ${response.status} ${response.url}`);
  if (response.status !== 200) {
    killTree(child);
    fail(`expected HTTP 200 from ${url}/, got ${response.status}`);
  }
  if (!/First-run setup|Create your account/i.test(body)) {
    killTree(child);
    fail(`${response.url} answered 200 but does not look like the setup page`);
  }
  if (!fs.existsSync(path.join(root, "data"))) {
    killTree(child);
    fail(`no data folder next to the app in ${root}`);
  }

  console.log("smoke: stopping");
  killTree(child);
  const stopBy = Date.now() + STOP_TIMEOUT_MS;
  while (Date.now() < stopBy) {
    try {
      await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2000) });
      await sleep(500);
    } catch {
      console.log(`smoke: port ${port} is quiet again`);
      console.log("SMOKE OK");
      return;
    }
  }
  fail(`something is still listening on 127.0.0.1:${port} after stopping`);
}

main().catch((error) => fail(error?.stack || String(error)));
