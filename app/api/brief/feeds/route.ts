/**
 * GET    /api/brief/feeds                   suggestions (never auto-subscribed), the owner's feeds, env feeds
 * POST   /api/brief/feeds {url}              accept a suggestion, or add any RSS/Atom URL by hand
 * PATCH  /api/brief/feeds {url,enabled}      switch one off without losing it
 * DELETE /api/brief/feeds {url}              remove one
 *
 * Feeds from BRIEF_FEEDS are reported as `configured` and are read-only here:
 * they belong to whoever runs the server, not to this page.
 */
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { invalidateBriefCache } from "@/lib/brief/build";
import { acceptFeed, feedCatalog, readAcceptedFeeds, removeFeed, setFeedEnabled } from "@/lib/brief/feeds-store";
import { briefFeeds, isDemoMode } from "@/lib/config";
import { ensureDemoSeeded } from "@/lib/demo";
import { suggestFeeds } from "@/lib/persona/interests";
import { readInterests } from "@/lib/persona/interests-store";

export const runtime = "nodejs";

function payload() {
  const accepted = readAcceptedFeeds();
  const configured = briefFeeds();
  const suggestions = suggestFeeds(feedCatalog(), readInterests(), [...configured, ...accepted.map((f) => f.url)]);
  return { suggestions, accepted, configured, demo: isDemoMode() };
}

export async function GET() {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  ensureDemoSeeded();
  return NextResponse.json(payload(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  const body = (await req.json().catch(() => null)) as { url?: unknown; title?: unknown; because?: unknown } | null;
  if (!body || typeof body.url !== "string") return NextResponse.json({ error: "url is required" }, { status: 400 });
  try {
    acceptFeed({ url: body.url, title: typeof body.title === "string" ? body.title : undefined, because: Array.isArray(body.because) ? body.because.filter((x): x is string => typeof x === "string") : [] });
    invalidateBriefCache();
    return NextResponse.json(payload(), { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not accept" }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  const body = (await req.json().catch(() => null)) as { url?: unknown; enabled?: unknown } | null;
  if (!body || typeof body.url !== "string" || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "url (string) and enabled (boolean) are required" }, { status: 400 });
  }
  setFeedEnabled(body.url, body.enabled);
  invalidateBriefCache();
  return NextResponse.json(payload());
}

export async function DELETE(req: Request) {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  const body = (await req.json().catch(() => null)) as { url?: unknown } | null;
  if (!body || typeof body.url !== "string") return NextResponse.json({ error: "url is required" }, { status: 400 });
  removeFeed(body.url);
  invalidateBriefCache();
  return NextResponse.json(payload());
}
