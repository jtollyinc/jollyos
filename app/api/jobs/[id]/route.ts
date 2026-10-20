/**
 * GET    /api/jobs/:id        one card
 * PATCH  /api/jobs/:id        edit title/brief, move lanes by hand (lane "inbox" also unblocks)
 * DELETE /api/jobs/:id
 */
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { deleteJob, getJob, unblockJob, updateJob, type Job, type JobLane } from "@/lib/jobs/store";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };
const LANES: JobLane[] = ["inbox", "running", "done", "failed", "blocked"];

export async function GET(_req: Request, { params }: Params) {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  const job = getJob((await params).id);
  return job ? NextResponse.json({ job }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PATCH(req: Request, { params }: Params) {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  const body = (await req.json().catch(() => null)) as Partial<Pick<Job, "title" | "brief" | "lane">> | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const id = (await params).id;
  const patch: Partial<Job> = {};
  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim().slice(0, 120);
  if (typeof body.brief === "string") patch.brief = body.brief.trim().slice(0, 4000);
  if (body.lane) {
    if (!LANES.includes(body.lane)) return NextResponse.json({ error: "Invalid lane" }, { status: 400 });
    if (body.lane === "inbox") {
      const job = unblockJob(id);
      if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
      Object.assign(patch, { progress: 0, startedAt: null, finishedAt: null, error: null });
    } else {
      patch.lane = body.lane;
      if (body.lane === "done") { patch.progress = 100; patch.finishedAt = new Date().toISOString(); }
    }
  }
  const job = Object.keys(patch).length ? updateJob(id, patch) : getJob(id);
  return job ? NextResponse.json({ job: getJob(id) ?? job }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: Params) {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  return deleteJob((await params).id) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
