/**
 * GET  /api/modules            every module with its status
 * PATCH /api/modules { id, enabled }   toggle one (Settings page)
 */
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { loadStatuses, setModuleEnabled } from "@/lib/modules/registry";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  return NextResponse.json({ modules: loadStatuses() });
}

export async function PATCH(req: Request) {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  const body = (await req.json().catch(() => null)) as { id?: string; enabled?: boolean } | null;
  if (!body?.id || typeof body.enabled !== "boolean") return NextResponse.json({ error: "id and enabled are required" }, { status: 400 });
  try {
    setModuleEnabled(body.id, body.enabled);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown module" }, { status: 400 });
  }
  return NextResponse.json({ modules: loadStatuses() });
}
