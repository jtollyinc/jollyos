/**
 * POST /api/auth/setup — first-run only. Creates the owner and signs in.
 * Single-use: once an owner exists it answers 409 forever, so nobody can
 * take over an instance by hitting it later. 400 in demo mode (no owner).
 */
import { NextResponse } from "next/server";
import { AuthError, SESSION_COOKIE, cookieOptions, createOwner, createSessionToken, ownerExists } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (isDemoMode()) return NextResponse.json({ error: "Demo mode has no owner account." }, { status: 400 });
  if (ownerExists()) return NextResponse.json({ error: "An owner already exists. Sign in instead." }, { status: 409 });
  const body = (await req.json().catch(() => null)) as { username?: unknown; password?: unknown } | null;
  const username = typeof body?.username === "string" ? body.username : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!username || !password) return NextResponse.json({ error: "username and password are required" }, { status: 400 });
  try {
    const owner = createOwner(username, password);
    const token = await createSessionToken(owner);
    const res = NextResponse.json({ ok: true, username: owner.username }, { status: 201 });
    res.cookies.set(SESSION_COOKIE, token, cookieOptions(new URL(req.url).protocol === "https:"));
    return res;
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.message.includes("already exists") ? 409 : 400 });
    throw err;
  }
}
