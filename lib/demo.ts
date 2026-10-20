/**
 * lib/demo — seed the fictional demo data on first start.
 * ────────────────────────────────────────────────────────────────────────────
 * When DEMO_MODE is on and DATA_DIR has never been seeded, the JSON under
 * demo/seed/ is copied into DATA_DIR (persona, jobs, brief stories, decisions)
 * and a marker file is written so it happens once. Nothing is overwritten:
 * each file is only written if it does not already exist, so edits made in the
 * demo survive a restart.
 *
 * Everything in demo/seed/ is fictional ("Alex Rivera") and says so.
 * SERVER-SIDE ONLY.
 */
import fs from "node:fs";
import { isDemoMode } from "@/lib/config";
import { appendJsonl, dataPath, fileExists, writeJson } from "@/lib/data-dir";
import briefStories from "@/demo/seed/brief-stories.json";
import decisions from "@/demo/seed/decisions.json";
import jobs from "@/demo/seed/jobs.json";
import persona from "@/demo/seed/persona.json";

const marker = () => dataPath("demo-seeded.json");

export function ensureDemoSeeded(): boolean {
  if (!isDemoMode()) return false;
  if (fileExists(marker())) return false;

  const writeIfMissing = (file: string, value: unknown) => {
    if (!fileExists(file)) writeJson(file, value);
  };
  writeIfMissing(dataPath("persona.json"), persona);
  writeIfMissing(dataPath("jobs.json"), jobs);
  writeIfMissing(dataPath("brief-stories.json"), briefStories);

  const cloudFile = dataPath("decisions.jsonl");
  const localFile = dataPath("private", "decisions.jsonl");
  if (!fileExists(cloudFile) && !fileExists(localFile)) {
    for (const a of decisions.answers) appendJsonl(a.privacy === "local-only" ? localFile : cloudFile, a);
  }

  fs.writeFileSync(marker(), JSON.stringify({ seededAt: new Date().toISOString(), fictional: true }) + "\n", "utf8");
  return true;
}
