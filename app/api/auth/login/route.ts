/**
 * POST /api/auth/login — password check + session cookie.
 * Throttled in memory: 8 failures per 15 minutes per client, counted only on
 * failure, so a correct password is never slowed by its own history. There is
 * no built-in account: with no owner yet, every attempt fails.
 */
import { NextResponse } from "next/server";
import { SESSION_COOKIE, cookieOptions, createSessionToken, readOwner, verifyOwnerLogin } from "@/lib/auth";
import { clientKey, createThrottle } from "@/lib/auth/throttle";
import { isDemoMode } from "@/lib/config";

export const runtime = "nodejs";

const throttle = createThrottle(8, 15 * 60 * 1000);

export async function POST(req: Request) {
  if (isDemoMode()) return NextResponse.json({ ok: true, demo: true });
  const key = clientKey(req.headers);
  if (throttle.blocked(key)) return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });

  const body = (await req.json().catch(() => null)) as { username?: unknown; password?: unknown } | null;
  const username = typeof body?.username === "string" ? body.username : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!username || !password) return NextResponse.json({ error: "username and password are required" }, { status: 400 });

  const owner = readOwner();
  if (!owner || !verifyOwnerLogin(username, password)) {
    throttle.fail(key);
    return NextResponse.json({ error: "Wrong username or password." }, { status: 401 });
  }
  throttle.clear(key);
  const token = await createSessionToken(owner);
  const res = NextResponse.json({ ok: true, username: owner.username });
  res.cookies.set(SESSION_COOKIE, token, cookieOptions(new URL(req.url).protocol === "https:"));
  return res;
}
