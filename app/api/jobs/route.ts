/**
 * GET  /api/jobs                       the board: jobs (lanes settle on read), counts, the runner registry with health, the Auto default
 * POST /api/jobs { text } | { title, brief }  [, private, runner, run]   capture a card; `run: true` hands it to a runner at once
 */
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { defaultRunner } from "@/lib/config";
import { ensureDemoSeeded } from "@/lib/demo";
import { runJob, runnerStatuses } from "@/lib/jobs/runners";
import { captureToJob, createJob, jobCounts, readJobs, RUNNER_MANIFESTS } from "@/lib/jobs/store";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  ensureDemoSeeded();
  const jobs = readJobs();
  const statuses = await runnerStatuses();
  return NextResponse.json({
    jobs,
    counts: jobCounts(jobs),
    defaultRunner: defaultRunner(),
    runners: RUNNER_MANIFESTS.map((m) => ({ ...m, health: statuses.find((s) => s.id === m.id) ?? null })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  const body = (await req.json().catch(() => null)) as { text?: string; title?: string; brief?: string; private?: boolean; runner?: string; run?: boolean } | null;
  const input = body?.text ? captureToJob(body.text) : body?.title ? { title: body.title, brief: body.brief } : null;
  if (!input) return NextResponse.json({ error: "text or title is required" }, { status: 400 });
  let job;
  try {
    job = createJob({ ...input, private: body?.private === true || input.private === true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not create the job" }, { status: 400 });
  }
  if (body?.run !== true) return NextResponse.json({ job }, { status: 201 });
  const result = await runJob(job.id, body.runner ?? "auto");
  if ("error" in result) return NextResponse.json({ job, error: result.error }, { status: result.status });
  return NextResponse.json({ job: result.job, resolution: result.resolution }, { status: 201 });
}
