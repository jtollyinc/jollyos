/** GET /api/health — liveness for Docker and uptime checks. No secrets. */
import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/config";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({ ok: true, demo: isDemoMode(), at: new Date().toISOString() });
}
