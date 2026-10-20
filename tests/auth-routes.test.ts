/**
 * The auth route handlers end to end in plain Node: setup is single-use,
 * login has no defaults, the password route throttles and re-issues the cookie.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOwner, createSessionToken, readOwner, resetAuthSecretCache, sessionFromCookie, type Session } from "@/lib/auth";

// The password route reads the session through next/headers, which only
// exists inside a Next request; stand it in with what the proxy would have resolved.
const sessionRef: { current: Session | null } = { current: null };
vi.mock("@/lib/auth/session", async () => {
  const { NextResponse } = await import("next/server");
  return {
    getSession: async () => sessionRef.current,
    requireSession: async () => (sessionRef.current ? { session: sessionRef.current } : { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }),
  };
});

const { POST: setup } = await import("@/app/api/auth/setup/route");
const { POST: login } = await import("@/app/api/auth/login/route");
const { POST: password } = await import("@/app/api/auth/password/route");

let dir: string;
const savedNodeEnv = process.env.NODE_ENV;
const setNodeEnv = (value: string | undefined) => { (process.env as Record<string, string | undefined>).NODE_ENV = value; };
const STRONG = "orbit-lantern-quiet-42";
const NEXT = "quiet-harbour-lantern";

const post = (handler: (req: Request) => Promise<Response>, body: unknown, headers: Record<string, string> = {}) =>
  handler(new Request("http://localhost/api/auth/x", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }));

const cookieToken = (res: Response): string | undefined => res.headers.get("set-cookie")?.match(/jollyos_session=([^;]*)/)?.[1];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "jollyos-routes-"));
  process.env.DATA_DIR = dir;
  delete process.env.AUTH_SECRET;
  delete process.env.DEMO_MODE;
  sessionRef.current = null;
  resetAuthSecretCache();
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
  delete process.env.DEMO_MODE;
  setNodeEnv(savedNodeEnv);
  resetAuthSecretCache();
});

describe("POST /api/auth/setup", () => {
  it("creates the owner once, signs in, then is closed with 409", async () => {
    const weak = await post(setup, { username: "owner", password: "short" });
    expect(weak.status).toBe(400);
    expect(((await weak.json()) as { error: string }).error).toMatch(/12 characters/);
    expect(readOwner()).toBeNull();

    const first = await post(setup, { username: "owner", password: STRONG });
    expect(first.status).toBe(201);
    const token = cookieToken(first);
    expect(token).toBeTruthy();
    expect(first.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect((await sessionFromCookie(token))?.username).toBe("owner");

    const again = await post(setup, { username: "intruder", password: "another-long-one-9" });
    expect(again.status).toBe(409);
    expect(readOwner()?.username).toBe("owner");
    expect(cookieToken(again)).toBeUndefined();
  });

  it("refuses in demo mode", async () => {
    process.env.DEMO_MODE = "true";
    expect((await post(setup, { username: "owner", password: STRONG })).status).toBe(400);
    expect(readOwner()).toBeNull();
  });
});

describe("POST /api/auth/login", () => {
  it("has no default credentials, in production too", async () => {
    setNodeEnv("production");
    const pairs = [["admin", "admin"], ["admin", "password"], ["alex", "alex"], ["owner", "owner"], ["", ""], ["demo", "demo"]];
    for (const [i, [username, pw]] of pairs.entries()) {
      const res = await post(login, { username, password: pw }, { "x-forwarded-for": `client-${i + 1}` });
      expect(res.status, `${username}/${pw}`).toBeGreaterThanOrEqual(400);
      expect(cookieToken(res), `${username}/${pw}`).toBeUndefined();
    }
    createOwner("owner", STRONG);
    for (const [username, pw] of pairs) {
      const res = await post(login, { username, password: pw }, { "x-forwarded-for": "client-77" });
      expect(res.status, `${username}/${pw}`).toBeGreaterThanOrEqual(400);
      expect(cookieToken(res), `${username}/${pw}`).toBeUndefined();
    }
    const ok = await post(login, { username: "owner", password: STRONG }, { "x-forwarded-for": "client-78" });
    expect(ok.status).toBe(200);
    expect((await sessionFromCookie(cookieToken(ok)))?.username).toBe("owner");
  });
});

describe("POST /api/auth/password", () => {
  it("needs a session and refuses demo mode", async () => {
    expect((await post(password, { current: STRONG, next: NEXT })).status).toBe(401);
    process.env.DEMO_MODE = "true";
    sessionRef.current = { username: "alex", displayName: "Alex Rivera", demo: true };
    expect((await post(password, { current: STRONG, next: NEXT })).status).toBe(400);
  });

  it("changes the password, re-issues this cookie and invalidates the others", async () => {
    const owner = createOwner("owner", STRONG);
    sessionRef.current = { username: "owner", displayName: "owner", demo: false };
    const otherDevice = await createSessionToken(owner);

    const wrong = await post(password, { current: "not-the-password-1", next: NEXT }, { "x-forwarded-for": "client-5" });
    expect(wrong.status).toBe(403);
    const weak = await post(password, { current: STRONG, next: "password1234" }, { "x-forwarded-for": "client-5" });
    expect(weak.status).toBe(400);
    expect(readOwner()?.sessionEpoch).toBe(1);

    const ok = await post(password, { current: STRONG, next: NEXT }, { "x-forwarded-for": "client-5" });
    expect(ok.status).toBe(200);
    const fresh = cookieToken(ok);
    expect(fresh).toBeTruthy();
    expect(readOwner()?.sessionEpoch).toBe(2);
    expect((await sessionFromCookie(fresh))?.username).toBe("owner");
    expect(await sessionFromCookie(otherDevice)).toBeNull();

    const relogin = await post(login, { username: "owner", password: NEXT }, { "x-forwarded-for": "client-6" });
    expect(relogin.status).toBe(200);
    expect((await post(login, { username: "owner", password: STRONG }, { "x-forwarded-for": "client-6" })).status).toBe(401);
  });

  it("throttles after 5 wrong current passwords per client", async () => {
    createOwner("owner", STRONG);
    sessionRef.current = { username: "owner", displayName: "owner", demo: false };
    const client = { "x-forwarded-for": "client-9" };
    for (let i = 0; i < 5; i++) {
      expect((await post(password, { current: `wrong-${i}-wrong-wrong`, next: NEXT }, client)).status).toBe(403);
    }
    const blocked = await post(password, { current: STRONG, next: NEXT }, client);
    expect(blocked.status).toBe(429);
    expect(readOwner()?.sessionEpoch).toBe(1);
    // Another client is not affected.
    expect((await post(password, { current: STRONG, next: NEXT }, { "x-forwarded-for": "client-10" })).status).toBe(200);
  });
});
