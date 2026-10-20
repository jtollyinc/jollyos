/** GET /api/import/raw → summary · DELETE → remove every stored upload (queue and persona untouched). */
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { deleteRawFiles, rawFilesSummary } from "@/lib/import/queue";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  return NextResponse.json(rawFilesSummary(), { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE() {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  return NextResponse.json(deleteRawFiles());
}
