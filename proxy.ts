/**
 * proxy.ts — the request gate (Next.js 16's name for middleware).
 * ────────────────────────────────────────────────────────────────────────────
 * Runs before every page and API route:
 *   demo mode      → everything passes; /setup and /login bounce to /.
 *   no owner yet   → pages redirect to /setup; APIs other than setup get 401.
 *   owner exists   → /setup redirects to /login; anonymous pages redirect to
 *                    /login?next=…; anonymous APIs get 401.
 * Public always: /login, /setup, /api/auth/*, /api/health, Next's own assets.
 * Route handlers re-check the session (lib/auth/session) so a mistake here is
 * not a hole.
 */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, ownerExists, verifySessionToken } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";

const PUBLIC_PAGES = ["/login", "/setup"];
const PUBLIC_API = ["/api/auth", "/api/health"];

const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(base + "/");

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = under(pathname, "/api");
  const publicPage = PUBLIC_PAGES.some((p) => under(pathname, p));
  const publicApi = PUBLIC_API.some((p) => under(pathname, p));

  if (isDemoMode()) {
    if (publicPage) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  if (!ownerExists()) {
    if (pathname === "/setup" || under(pathname, "/api/auth/setup") || under(pathname, "/api/health")) return NextResponse.next();
    if (isApi) return NextResponse.json({ error: "Setup required" }, { status: 401 });
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  if (pathname === "/setup") return NextResponse.redirect(new URL("/login", request.url));
  if (publicPage || publicApi) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const username = token ? await verifySessionToken(token) : null;
  if (username) return NextResponse.next();

  if (isApi) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
