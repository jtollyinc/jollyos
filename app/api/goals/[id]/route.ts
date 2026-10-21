/** PATCH /api/goals/[id] — edit or archive · DELETE — remove it entirely. */
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { deleteGoal, updateGoal } from "@/lib/goals/store";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const goal = updateGoal((await params).id, {
    want: typeof body?.want === "string" ? body.want : undefined,
    why: typeof body?.why === "string" ? body.why : undefined,
    nextStep: typeof body?.nextStep === "string" ? body.nextStep : undefined,
    hoursClaimed: typeof body?.hoursClaimed === "number" ? body.hoursClaimed : undefined,
    target: typeof body?.target === "number" ? body.target : undefined,
    archived: typeof body?.archived === "boolean" ? body.archived : undefined,
  });
  if (!goal) return NextResponse.json({ error: "No such goal." }, { status: 404 });
  return NextResponse.json({ goal });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  return NextResponse.json({ ok: deleteGoal((await params).id) });
}
