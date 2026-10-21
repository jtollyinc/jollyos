#!/usr/bin/env node
/**
 * scripts/launcher/launch.mjs — the one launcher the double-click wrappers run.
 * ────────────────────────────────────────────────────────────────────────────
 * It ships inside the per-OS release zips as `app/launcher.mjs`, started by the
 * BUNDLED Node runtime ("Start JollyOS.cmd" / ".command" / "start-jollyos.sh").
 * One script for all three so the behaviour cannot drift per OS: pick a free
 * port, start the standalone Next server bound to 127.0.0.1, wait until it
 * answers, open the browser, and keep the server alive only as long as this
 * window is open.
 *
 * It must run on a machine with nothing installed: no npm, no PATH node, no
 * Docker. So it uses only node: built-ins and `process.execPath` (the runtime
 * that started it) — never a `node` found on PATH.
 *
 * Layout inside the zip (data/ is created on first run and survives updates):
 *   JollyOS/
 *     Start JollyOS.cmd | .command | start-jollyos.sh
 *     app/      server.js, .next/, public/, node_modules/, launcher.mjs
 *     runtime/  the official Node 22 build for this OS
 *     data/     owner account, jobs, persona, brief cache, server.log
 *
 * Environment: PORT (first port to try, default 3000), DATA_DIR (default
 * ../data), JOLLYOS_NO_BROWSER=1 to skip opening the browser (the CI smoke
 * test sets it), JOLLYOS_READY_TIMEOUT_MS.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.dirname(APP_DIR);
const DATA_DIR = process.env.DATA_DIR?.trim() || path.join(ROOT_DIR, "data");
const FIRST_PORT = Number.parseInt(process.env.PORT ?? "", 10) || 3000;
const PORT_TRIES = 50;
const READY_TIMEOUT_MS = Number.parseInt(process.env.JOLLYOS_READY_TIMEOUT_MS ?? "", 10) || 120_000;
const NO_BROWSER =
  process.argv.includes("--no-browser") || ["1", "true", "yes", "on"].includes((process.env.JOLLYOS_NO_BROWSER ?? "").toLowerCase());

/** True when nothing is listening on 127.0.0.1:port right now. */
function portIsFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "127.0.0.1");
  });
}

/** The first free port at or after `start` — 3000 is often taken by something else. */
async function pickPort(start) {
  for (let port = start; port < start + PORT_TRIES; port++) {
    if (await portIsFree(port)) return port;
  }
  return null;
}

/** One GET; resolves with the status code, or 0 if the server is not up yet. */
function probe(port, requestPath) {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: requestPath, timeout: 4000 }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(0));
  });
}

/** Poll /api/health until it answers 200, or give up (the server logs why). */
async function waitForReady(port, deadline) {
  while (Date.now() < deadline) {
    if ((await probe(port, "/api/health")) === 200) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

/** Hand the URL to whatever the OS calls the default browser; never fatal. */
function openBrowser(url) {
  const [command, args] =
    process.platform === "win32"
      ? [process.env.COMSPEC || "cmd.exe", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  try {
    const opener = spawn(command, args, { stdio: "ignore", detached: true });
    opener.on("error", () => {});
    opener.unref();
  } catch {
    // No browser we can drive (a headless box, a locked-down desktop): the
    // banner below already tells the user the address to open by hand.
  }
}

function banner(lines) {
  const rule = "=".repeat(64);
  console.log(`\n${rule}\n${lines.map((l) => (l ? `  ${l}` : "")).join("\n")}\n${rule}\n`);
}

async function main() {
  const serverEntry = path.join(APP_DIR, "server.js");
  if (!fs.existsSync(serverEntry)) {
    console.error(`Cannot find ${serverEntry}. Unzip the whole folder and keep its files together.`);
    process.exit(1);
  }

  const port = await pickPort(FIRST_PORT);
  if (port === null) {
    console.error(`No free port between ${FIRST_PORT} and ${FIRST_PORT + PORT_TRIES - 1}. Close something and try again.`);
    process.exit(1);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const logFile = path.join(DATA_DIR, "server.log");
  const log = fs.createWriteStream(logFile, { flags: "a" });
  log.write(`\n--- JollyOS start ${new Date().toISOString()} on 127.0.0.1:${port} ---\n`);

  const server = spawn(process.execPath, [serverEntry], {
    cwd: APP_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1", // never the whole network: this is one person's machine
      DATA_DIR,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });

  // The window stays readable: everything the server says goes to the log, and
  // only its errors are echoed here.
  server.stdout.pipe(log, { end: false });
  server.stderr.pipe(log, { end: false });
  server.stderr.on("data", (chunk) => process.stderr.write(chunk));

  let stopping = false;
  let failed = false; // a timeout must not look like a clean shutdown
  // Next's standalone server signals its whole process group on SIGTERM, so
  // killing it sends SIGTERM back here too. The handlers below swallow that
  // (we are already stopping); on a timeout the process can still land on exit
  // code 143 instead of 1 — either way it is non-zero, which is what the
  // wrappers check before they show the error and pause.

  const stop = (signal) => {
    if (stopping) return;
    stopping = true;
    if (server.exitCode === null) server.kill(signal === "SIGTERM" ? "SIGTERM" : "SIGINT");
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
    process.on(signal, () => stop("SIGTERM"));
  }
  process.on("exit", () => stop("SIGTERM")); // closing the window must not leave a server behind

  server.on("exit", (code, signal) => {
    if (!stopping) {
      console.error(`\nJollyOS stopped unexpectedly (${signal ?? `code ${code}`}). The reason is in:\n  ${logFile}`);
    }
    process.exit(!stopping || failed ? (code || 1) : 0);
  });
  server.on("error", (error) => {
    console.error(`Could not start JollyOS: ${error.message}`);
    process.exit(1);
  });

  const url = `http://127.0.0.1:${port}`;
  console.log("Starting JollyOS...");
  const ready = await waitForReady(port, Date.now() + READY_TIMEOUT_MS);
  if (!ready) {
    console.error(`JollyOS did not answer within ${Math.round(READY_TIMEOUT_MS / 1000)} seconds. See ${logFile}`);
    failed = true;
    stop("SIGTERM");
    process.exitCode = 1;
    return;
  }

  banner([
    "JollyOS is running.",
    "",
    `Open it here:   ${url}`,
    `Your data:      ${DATA_DIR}`,
    "",
    "The first visit asks you to pick a username and password.",
    "To stop JollyOS: close this window (or press Ctrl+C).",
  ]);
  if (!NO_BROWSER) openBrowser(url);
}

main().catch((error) => {
  console.error(`Could not start JollyOS: ${error?.message ?? error}`);
  process.exit(1);
});
