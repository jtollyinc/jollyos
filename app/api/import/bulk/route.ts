/** POST /api/import/bulk { action: approve|reject, ids?: string[], minConfidence?: number } */
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { bulkReview, queueCounts } from "@/lib/import/queue";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  const body = (await req.json().catch(() => null)) as { action?: unknown; ids?: unknown; minConfidence?: unknown } | null;
  if (!body || (body.action !== "approve" && body.action !== "reject")) return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string") : undefined;
  const minConfidence = typeof body.minConfidence === "number" ? body.minConfidence : undefined;
  const r = bulkReview(body.action, { ids, minConfidence });
  return NextResponse.json({ ...r, counts: queueCounts() });
}
