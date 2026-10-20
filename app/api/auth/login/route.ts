/**
 * POST /api/auth/login — password check + session cookie.
 * A small in-memory throttle: 8 failures per 15 minutes per client, counted
 * only on failure, so a correct password is never slowed by its own history.
 */
import { NextResponse } from "next/server";
import { SESSION_COOKIE, cookieOptions, createSessionToken, readOwner, verifyOwnerLogin } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";

export const runtime = "nodejs";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;
const failures = new Map<string, number[]>();

function clientKey(req: Request): string {
  const h = req.headers;
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "direct";
}

function throttled(key: string, now: number): boolean {
  const recent = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length) failures.set(key, recent); else failures.delete(key);
  return recent.length >= MAX_FAILURES;
}

export async function POST(req: Request) {
  if (isDemoMode()) return NextResponse.json({ ok: true, demo: true });
  const key = clientKey(req);
  const now = Date.now();
  if (throttled(key, now)) return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });

  const body = (await req.json().catch(() => null)) as { username?: string; password?: string } | null;
  if (!body?.username || !body.password) return NextResponse.json({ error: "username and password are required" }, { status: 400 });

  if (!verifyOwnerLogin(body.username, body.password)) {
    failures.set(key, [...(failures.get(key) ?? []), now]);
    return NextResponse.json({ error: "Wrong username or password." }, { status: 401 });
  }
  failures.delete(key);
  const owner = readOwner()!;
  const token = await createSessionToken(owner.username);
  const res = NextResponse.json({ ok: true, username: owner.username });
  res.cookies.set(SESSION_COOKIE, token, cookieOptions(new URL(req.url).protocol === "https:"));
  return res;
}
