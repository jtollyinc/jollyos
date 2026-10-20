/**
 * GET  /api/jobs                 the board (lanes settle on read)
 * POST /api/jobs { text } | { title, brief }   capture a card into the inbox
 */
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { ensureDemoSeeded } from "@/lib/demo";
import { RUNNERS } from "@/lib/jobs/runners";
import { captureToJob, createJob, jobCounts, readJobs } from "@/lib/jobs/store";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  ensureDemoSeeded();
  const jobs = readJobs();
  return NextResponse.json({
    jobs,
    counts: jobCounts(jobs),
    runners: RUNNERS.map((r) => ({ id: r.id, label: r.label, description: r.description })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  const body = (await req.json().catch(() => null)) as { text?: string; title?: string; brief?: string } | null;
  const input = body?.text ? captureToJob(body.text) : body?.title ? { title: body.title, brief: body.brief } : null;
  if (!input) return NextResponse.json({ error: "text or title is required" }, { status: 400 });
  try {
    return NextResponse.json({ job: createJob(input) }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not create the job" }, { status: 400 });
  }
}
