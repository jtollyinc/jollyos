/**
 * lib/auth/session — read the current session inside server components and
 * route handlers. Thin wrapper over lib/auth so pages never touch cookies
 * directly. SERVER-SIDE ONLY (next/headers).
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionFromCookie, type Session } from "@/lib/auth";

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return sessionFromCookie(jar.get(SESSION_COOKIE)?.value);
}

/** For API routes: the session, or a ready-made 401 response. */
export async function requireSession(): Promise<{ session: Session } | { response: NextResponse }> {
  const session = await getSession();
  if (!session) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session };
}
