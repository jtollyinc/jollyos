/** GET /api/persona/interests → the derived profile · POST → recompute it from the persona now. */
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { ensureDemoSeeded } from "@/lib/demo";
import { hasInterests, readInterests, refreshInterests } from "@/lib/persona/interests-store";
import { readEntries } from "@/lib/persona/store";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  ensureDemoSeeded();
  return NextResponse.json({ profile: readInterests(), derived: hasInterests() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST() {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  ensureDemoSeeded();
  return NextResponse.json({ profile: refreshInterests(readEntries()), derived: true });
}
