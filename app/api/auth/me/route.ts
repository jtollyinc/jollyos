/** GET /api/auth/me — who is signed in (or 401). */
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  return NextResponse.json(gate.session);
}
