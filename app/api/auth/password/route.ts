/**
 * POST /api/auth/password — change the owner's password from Settings.
 * Body { current, next }. Needs a session. Verifies the current password,
 * applies the same rules as setup, re-hashes, bumps the session epoch (every
 * other browser is signed out) and re-issues this browser's cookie so it
 * stays signed in. Wrong current passwords are throttled in memory: 5 per
 * 15 minutes per client, then 429. 400 in demo mode (no password there).
 */
import { NextResponse } from "next/server";
import { AuthError, SESSION_COOKIE, WrongPasswordError, changeOwnerPassword, cookieOptions, createSessionToken } from "@/lib/auth";
import { requireSession } from "@/lib/auth/session";
import { clientKey, createThrottle } from "@/lib/auth/throttle";
import { isDemoMode } from "@/lib/config";

export const runtime = "nodejs";

const throttle = createThrottle(5, 15 * 60 * 1000);

export async function POST(req: Request) {
  if (isDemoMode()) return NextResponse.json({ error: "Demo mode has no password to change." }, { status: 400 });
  const gate = await requireSession();
  if ("response" in gate) return gate.response;

  const key = `${gate.session.username}@${clientKey(req.headers)}`;
  if (throttle.blocked(key)) return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });

  const body = (await req.json().catch(() => null)) as { current?: unknown; next?: unknown } | null;
  const current = typeof body?.current === "string" ? body.current : "";
  const next = typeof body?.next === "string" ? body.next : "";
  if (!current || !next) return NextResponse.json({ error: "Current and new password are required." }, { status: 400 });

  try {
    const owner = changeOwnerPassword(current, next);
    throttle.clear(key);
    const token = await createSessionToken(owner);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, cookieOptions(new URL(req.url).protocol === "https:"));
    return res;
  } catch (err) {
    if (err instanceof WrongPasswordError) {
      throttle.fail(key);
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
