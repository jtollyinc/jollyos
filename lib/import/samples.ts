/**
 * lib/import/samples — the fictional sample exports for demo mode.
 * SERVER-SIDE ONLY (fs).
 * ────────────────────────────────────────────────────────────────────────────
 * demo/samples/ holds FAKE exports for the demo user Alex Rivera: a ChatGPT
 * conversations.json, a Claude conversations.json, three Markdown notes and a
 * pasted memory dump. "Try with sample data" runs each through the normal
 * import path (rule-based) as its own batch, so the review queue shows real
 * provenance per source. Read from disk at runtime; the Dockerfile copies the
 * folder into the image.
 */
import fs from "node:fs";
import path from "node:path";
import { runImport, type RunResult } from "./run";
import type { ImportSource } from "./types";

export function samplesDir(): string {
  const candidates = [path.resolve(process.cwd(), "demo", "samples"), path.resolve(__dirname, "..", "..", "demo", "samples")];
  return candidates.find((c) => fs.existsSync(c)) ?? candidates[0];
}

export interface SampleBatch {
  source: ImportSource;
  label: string;
  files?: string[];
  paste?: string;
}

export function sampleBatches(dir = samplesDir()): SampleBatch[] {
  const notes = fs.existsSync(path.join(dir, "notes")) ? fs.readdirSync(path.join(dir, "notes")).map((n) => path.join("notes", n)) : [];
  return [
    { source: "chatgpt", label: "ChatGPT export (sample)", files: ["chatgpt-conversations.json"] },
    { source: "claude", label: "Claude export (sample)", files: ["claude-conversations.json"] },
    { source: "markdown", label: "Notes folder (sample)", files: notes },
    { source: "paste", label: "Pasted memory (sample)", paste: fs.existsSync(path.join(dir, "pasted-memory.txt")) ? fs.readFileSync(path.join(dir, "pasted-memory.txt"), "utf8") : undefined },
  ];
}

export async function importSamples(): Promise<RunResult[]> {
  const dir = samplesDir();
  const out: RunResult[] = [];
  for (const b of sampleBatches(dir)) {
    const files = (b.files ?? []).filter((f) => fs.existsSync(path.join(dir, f))).map((f) => ({ name: f, data: fs.readFileSync(path.join(dir, f)) }));
    if (!files.length && !b.paste) continue;
    out.push(await runImport({ source: b.source, mode: "rules", cloudOptIn: false, files, paste: b.paste, keepRaw: false }));
  }
  return out;
}
