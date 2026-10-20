/** POST /api/persona/ask { question } — answer as the owner, privacy-routed. */
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { ensureDemoSeeded } from "@/lib/demo";
import { askMyself } from "@/lib/persona/ask";
import { readEntries } from "@/lib/persona/store";
import { ProviderError } from "@/lib/providers";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  ensureDemoSeeded();
  const body = (await req.json().catch(() => null)) as { question?: string } | null;
  const question = body?.question?.trim();
  if (!question) return NextResponse.json({ error: "question is required" }, { status: 400 });
  if (readEntries().length === 0) {
    return NextResponse.json({ error: "No persona entries yet. Add a few on the Persona page first." }, { status: 409 });
  }
  try {
    return NextResponse.json(await askMyself(question.slice(0, 2000)));
  } catch (err) {
    const message = err instanceof ProviderError ? err.message : "The model request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
