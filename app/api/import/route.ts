/**
 * GET  /api/import                 options (providers, demo), the review queue, batches, raw-file summary
 * POST /api/import  (multipart)    source, mode, cloudOptIn, paste, folder, files[] → candidates into the queue
 *
 * The cloud gate lives in lib/import/run (authorizeExtraction): a cloud request
 * without `cloudOptIn=true` is refused with 403 before any file is read.
 */
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/config";
import { ensureDemoSeeded } from "@/lib/demo";
import { queueCounts, rawFilesSummary, readBatches, readQueue } from "@/lib/import/queue";
import { runImport } from "@/lib/import/run";
import { isMode, isSource } from "@/lib/import/types";
import { providersFromEnv } from "@/lib/providers";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

export function importOptions() {
  const providers = providersFromEnv();
  return {
    demo: isDemoMode(),
    localAvailable: Boolean(providers.local),
    localProvider: providers.local ? { label: providers.local.label, model: providers.local.model } : null,
    defaultProvider: { label: providers.default.label, model: providers.default.model, kind: providers.default.kind },
  };
}

export async function GET() {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  ensureDemoSeeded();
  const queue = readQueue().sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.confidence - a.confidence);
  return NextResponse.json(
    { options: importOptions(), queue, counts: queueCounts(queue), batches: readBatches().reverse().slice(0, 20), raw: rawFilesSummary() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

const truthy = (v: unknown) => typeof v === "string" && ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());

export async function POST(req: Request) {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  ensureDemoSeeded();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }
  const source = form.get("source");
  const mode = form.get("mode");
  if (!isSource(source) || !isMode(mode)) return NextResponse.json({ error: "source and mode are required" }, { status: 400 });

  const files: { name: string; data: Buffer }[] = [];
  let total = 0;
  for (const entry of form.getAll("files")) {
    if (!(entry instanceof File)) continue;
    total += entry.size;
    if (total > MAX_UPLOAD_BYTES) return NextResponse.json({ error: `Uploads are limited to ${MAX_UPLOAD_BYTES / 1024 / 1024} MB per import.` }, { status: 400 });
    files.push({ name: entry.name || "upload", data: Buffer.from(await entry.arrayBuffer()) });
  }
  const paste = form.get("paste");
  const folder = form.get("folder");

  const result = await runImport({
    source,
    mode,
    cloudOptIn: truthy(form.get("cloudOptIn")),
    files,
    paste: typeof paste === "string" ? paste : undefined,
    folder: typeof folder === "string" ? folder : undefined,
    keepRaw: !truthy(form.get("discardRaw")),
  });
  return NextResponse.json(result.body, { status: result.status });
}
