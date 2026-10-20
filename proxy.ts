/**
 * proxy.ts — the request gate (Next.js 16's name for middleware).
 * ────────────────────────────────────────────────────────────────────────────
 * Runs before every page and API route and applies lib/auth/gate:
 *   demo mode      → everything passes; /setup and /login bounce to /.
 *   no owner yet   → pages redirect to /setup; APIs other than setup get 401.
 *   owner exists   → /setup redirects to /login; anonymous pages redirect to
 *                    /login?next=…; anonymous APIs get 401.
 * Public always: /login, /setup, /api/auth/*, /api/health, Next's own assets.
 * The session check reads the owner's epoch, so a password change signs every
 * other browser out at the gate, not just inside the pages. Route handlers
 * re-check the session (lib/auth/session) so a mistake here is not a hole.
 */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, ownerExists, sessionFromCookie } from "@/lib/auth";
import { gate } from "@/lib/auth/gate";
import { isDemoMode } from "@/lib/config";

export async function proxy(request: NextRequest) {
  const decision = await gate({
    pathname: request.nextUrl.pathname,
    demo: isDemoMode(),
    ownerExists: ownerExists(),
    hasSession: async () => Boolean(await sessionFromCookie(request.cookies.get(SESSION_COOKIE)?.value)),
  });
  if (decision.kind === "redirect") return NextResponse.redirect(new URL(decision.to, request.url));
  if (decision.kind === "unauthorized") return NextResponse.json({ error: decision.error }, { status: 401 });
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
