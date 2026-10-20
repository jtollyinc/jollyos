/**
 * lib/data-dir — where runtime state lives and how it is read and written.
 * ────────────────────────────────────────────────────────────────────────────
 * Everything JollyOS remembers (owner credentials, jobs, persona, decisions,
 * the brief cache) is a small JSON or JSONL file under DATA_DIR. No database:
 * a single-owner dashboard does not need one, and plain files are easy to back
 * up, inspect and delete. Writes go through a temp file + rename so a crash
 * mid-write never leaves a half-written file behind.
 *
 * SERVER-SIDE ONLY (fs). Resolved per call so tests can point DATA_DIR at a
 * temp directory.
 */
import fs from "node:fs";
import path from "node:path";

/** Absolute DATA_DIR (default ./data relative to the process cwd). */
export function dataDir(): string {
  // turbopackIgnore: DATA_DIR is a runtime setting, not a build-time path to trace.
  return path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR || "./data");
}

/** A path inside DATA_DIR, creating the parent directories. */
export function dataPath(...segments: string[]): string {
  const p = path.join(dataDir(), ...segments);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  return p;
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

/**
 * Atomic write: temp file in the same directory, then rename over the target.
 * `mode` (e.g. 0o600 for owner.json) applies to the new file; rename keeps it.
 */
export function writeJson(file: string, value: unknown, mode?: number): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", mode });
  fs.renameSync(tmp, file);
}

export function readJsonl<T>(file: string): T[] {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const out: T[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      // A corrupt line must not take the whole file down with it.
    }
  }
  return out;
}

export function appendJsonl(file: string, row: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(row) + "\n", "utf8");
}

export function fileExists(file: string): boolean {
  try {
    return fs.existsSync(file);
  } catch {
    return false;
  }
}
