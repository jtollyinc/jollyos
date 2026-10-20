/** PATCH / DELETE /api/persona/:id — edit or remove one entry. */
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { deleteEntry, isKind, isPrivacy, updateEntry, type EntryInput } from "@/lib/persona/store";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  const body = (await req.json().catch(() => null)) as { kind?: unknown; text?: unknown; privacy?: unknown } | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const patch: Partial<EntryInput> = {};
  if (isKind(body.kind)) patch.kind = body.kind;
  if (isPrivacy(body.privacy)) patch.privacy = body.privacy;
  if (typeof body.text === "string") patch.text = body.text;
  const entry = updateEntry((await params).id, patch);
  return entry ? NextResponse.json({ entry }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: Params) {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  return deleteEntry((await params).id) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
