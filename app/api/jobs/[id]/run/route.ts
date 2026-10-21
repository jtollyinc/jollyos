/** POST /api/jobs/:id/run { runner?: "auto" | id } — hand a card to a runner (Auto → the default; private → Local, never cloud). */
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { runJob } from "@/lib/jobs/runners";
import { runtimeEnv } from "@/lib/settings/ai";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  const body = (await req.json().catch(() => null)) as { runner?: string } | null;
  const result = await runJob((await params).id, body?.runner ?? "auto", runtimeEnv());
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ job: result.job, resolution: result.resolution });
}
