/**
 * GET  /api/brief              today's brief (cached per day)
 * POST /api/brief              rebuild now
 */
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getBrief } from "@/lib/brief/build";
import { ensureDemoSeeded } from "@/lib/demo";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  ensureDemoSeeded();
  return NextResponse.json({ brief: await getBrief() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST() {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  ensureDemoSeeded();
  return NextResponse.json({ brief: await getBrief({ refresh: true }) });
}
