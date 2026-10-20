/**
 * lib/auth/gate — the request-gate decision as a pure function.
 * ────────────────────────────────────────────────────────────────────────────
 * proxy.ts turns a request into these inputs and this function says what to
 * do, so the rules are unit-tested without a Next runtime:
 *
 *   demo mode     → everything passes; /setup and /login bounce to /.
 *   no owner yet  → only /setup, /api/auth/setup and /api/health pass; every
 *                   other page redirects to /setup and every other API is 401.
 *   owner exists  → /setup redirects to /login (setup is single-use); /login
 *                   and /api/auth/* and /api/health pass; everything else needs
 *                   a valid session or gets /login?next=… (pages) / 401 (APIs).
 *
 * Demo mode is the explicit DEMO_MODE=true only (lib/config). A missing owner
 * never falls back to the demo user: it lands on setup.
 */

export type GateDecision =
  | { kind: "next" }
  | { kind: "redirect"; to: string }
  | { kind: "unauthorized"; error: string };

export interface GateInput {
  pathname: string;
  demo: boolean;
  ownerExists: boolean;
  /** Called only when a session is actually required. */
  hasSession: () => Promise<boolean>;
}

const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(base + "/");
const isApi = (p: string) => under(p, "/api");
const PUBLIC_PAGES = ["/login", "/setup"];
const PUBLIC_API = ["/api/auth", "/api/health"];
const SETUP_ONLY = ["/setup", "/api/auth/setup", "/api/health"];

export async function gate({ pathname, demo, ownerExists, hasSession }: GateInput): Promise<GateDecision> {
  if (demo) {
    return PUBLIC_PAGES.some((p) => under(pathname, p)) ? { kind: "redirect", to: "/" } : { kind: "next" };
  }
  if (!ownerExists) {
    if (SETUP_ONLY.some((p) => under(pathname, p))) return { kind: "next" };
    return isApi(pathname) ? { kind: "unauthorized", error: "Setup required" } : { kind: "redirect", to: "/setup" };
  }
  if (under(pathname, "/setup")) return { kind: "redirect", to: "/login" };
  if (PUBLIC_PAGES.some((p) => under(pathname, p)) || PUBLIC_API.some((p) => under(pathname, p))) return { kind: "next" };
  if (await hasSession()) return { kind: "next" };
  if (isApi(pathname)) return { kind: "unauthorized", error: "Unauthorized" };
  return { kind: "redirect", to: pathname === "/" ? "/login" : `/login?next=${encodeURIComponent(pathname)}` };
}
