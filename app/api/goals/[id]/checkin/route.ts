/** POST /api/goals/[id]/checkin — the weekly two-minute check-in. */
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { recordCheckIn } from "@/lib/goals/store";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const row = recordCheckIn({
    goalId: (await params).id,
    did: body?.did === "yes" || body?.did === "partly" ? body.did : "no",
    value: typeof body?.value === "number" ? body.value : null,
    hoursActual: typeof body?.hoursActual === "number" ? body.hoursActual : 0,
    blockers: Array.isArray(body?.blockers) ? body.blockers.filter((x): x is string => typeof x === "string") : [],
    note: typeof body?.note === "string" ? body.note : "",
  });
  if (!row) return NextResponse.json({ error: "No such goal." }, { status: 404 });
  return NextResponse.json({ checkIn: row }, { status: 201 });
}
