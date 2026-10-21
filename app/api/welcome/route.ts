/**
 * GET  /api/welcome                  where the walkthrough left off + the AI brain state
 * PUT  /api/welcome {stepId,answers} save progress (called on every Next/Back)
 * POST /api/welcome {action}         finish | skip | restart | hide-checklist | show-checklist
 *
 * "finish" is the only one that writes anything outside walkthrough.json: it
 * seeds the persona and the feeds (lib/onboarding/store completeWalkthrough)
 * and answers with a receipt of exactly what it created.
 */
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/config";
import { ensureDemoSeeded } from "@/lib/demo";
import {
  completeWalkthrough,
  dismissChecklist,
  patchWalkthrough,
  readWalkthrough,
  restartWalkthrough,
  skipWalkthrough,
} from "@/lib/onboarding/store";
import { publicAiSettings } from "@/lib/settings/ai";

export const runtime = "nodejs";

const payload = () => ({ state: readWalkthrough(), ai: publicAiSettings(), demo: isDemoMode() });

export async function GET() {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  ensureDemoSeeded();
  return NextResponse.json(payload(), { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: Request) {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  const body = (await req.json().catch(() => null)) as { stepId?: unknown; answers?: unknown } | null;
  patchWalkthrough({ stepId: body?.stepId, answers: body?.answers });
  return NextResponse.json(payload());
}

export async function POST(req: Request) {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  const body = (await req.json().catch(() => null)) as { action?: unknown; stepId?: unknown; answers?: unknown } | null;
  switch (body?.action) {
    case "finish": {
      ensureDemoSeeded();
      const { receipt } = completeWalkthrough({ answers: body.answers });
      return NextResponse.json({ ...payload(), receipt });
    }
    case "skip":
      skipWalkthrough();
      return NextResponse.json(payload());
    case "restart":
      restartWalkthrough();
      return NextResponse.json(payload());
    case "hide-checklist":
      dismissChecklist(true);
      return NextResponse.json(payload());
    case "show-checklist":
      dismissChecklist(false);
      return NextResponse.json(payload());
    default:
      return NextResponse.json({ error: "action must be finish, skip, restart, hide-checklist or show-checklist" }, { status: 400 });
  }
}
