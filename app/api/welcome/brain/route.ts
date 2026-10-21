/**
 * POST /api/welcome/brain       save the model choice (DATA_DIR/ai-settings.json, mode 600)
 * PUT  /api/welcome/brain       test it for real, from this server, and say so plainly
 *
 * Neither verb ever answers with a key: POST returns the public view (a
 * four-character hint and a boolean) and PUT returns one sentence. In demo mode
 * a key is accepted, tested and then thrown away — the walkthrough has to be
 * recordable without a real secret landing in the demo's DATA_DIR.
 */
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/config";
import { publicAiSettings, writeAiSettings, type ApiVendor } from "@/lib/settings/ai";
import { testApiKey, testLocalModel } from "@/lib/settings/reach";
import type { BrainChoice } from "@/lib/onboarding/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const brainOf = (v: unknown): BrainChoice => (v === "local" || v === "api" ? v : "none");
const vendorOf = (v: unknown): ApiVendor => (v === "openai" ? "openai" : "anthropic");
const strOf = (v: unknown, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: Request) {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const brain = brainOf(body?.brain);
  const demo = isDemoMode();
  try {
    const ai = writeAiSettings({
      brain,
      vendor: vendorOf(body?.vendor),
      localBaseUrl: strOf(body?.localBaseUrl, 300),
      localModel: strOf(body?.localModel, 120),
      // Demo mode never persists the secret; "clear" wipes any earlier one.
      apiKey: demo ? "clear" : strOf(body?.apiKey),
    });
    return NextResponse.json({ ai, note: demo && brain === "api" ? "Demo mode: the key was tested but not saved." : null });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not save that.", ai: publicAiSettings() }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const brain = brainOf(body?.brain);
  if (brain === "local") return NextResponse.json(await testLocalModel(strOf(body?.localBaseUrl, 300)));
  if (brain === "api") return NextResponse.json(await testApiKey(vendorOf(body?.vendor), strOf(body?.apiKey)));
  return NextResponse.json({ ok: true, message: "Nothing to test — JollyOS answers from its built-in deterministic responder." });
}
