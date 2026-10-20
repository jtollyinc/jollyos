/**
 * GET  /api/persona               every entry (the owner's own browser sees all tiers)
 * POST /api/persona { kind, text, privacy }
 */
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { ensureDemoSeeded } from "@/lib/demo";
import { addEntry, isKind, isPrivacy, personaCounts, readEntries } from "@/lib/persona/store";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  ensureDemoSeeded();
  const entries = readEntries();
  return NextResponse.json({ entries, counts: personaCounts(entries) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  const body = (await req.json().catch(() => null)) as { kind?: unknown; text?: unknown; privacy?: unknown } | null;
  if (!body || !isKind(body.kind) || typeof body.text !== "string" || !isPrivacy(body.privacy)) {
    return NextResponse.json({ error: "kind, text and privacy are required" }, { status: 400 });
  }
  try {
    return NextResponse.json({ entry: addEntry({ kind: body.kind, text: body.text, privacy: body.privacy }) }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not save" }, { status: 400 });
  }
}
