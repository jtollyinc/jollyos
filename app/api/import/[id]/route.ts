/** PATCH /api/import/:id { action: approve|reject|edit|reset, text?, category?, privacy? } */
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { reviewCandidate, type ReviewAction, type ReviewEdits } from "@/lib/import/queue";
import { isCategory } from "@/lib/import/types";
import { isPrivacy } from "@/lib/persona/types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };
const ACTIONS: ReviewAction[] = ["approve", "reject", "edit", "reset"];

export async function PATCH(req: Request, { params }: Params) {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  const body = (await req.json().catch(() => null)) as { action?: unknown; text?: unknown; category?: unknown; privacy?: unknown } | null;
  if (!body || !ACTIONS.includes(body.action as ReviewAction)) return NextResponse.json({ error: "action must be approve, reject, edit or reset" }, { status: 400 });
  const edits: ReviewEdits = {};
  if (typeof body.text === "string") edits.text = body.text;
  if (isCategory(body.category)) edits.category = body.category;
  if (isPrivacy(body.privacy)) edits.privacy = body.privacy;
  try {
    const r = reviewCandidate((await params).id, body.action as ReviewAction, edits);
    return r ? NextResponse.json(r) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not review" }, { status: 400 });
  }
}
