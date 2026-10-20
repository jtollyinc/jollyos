/**
 * Pre-launch auth hardening: no built-in credentials, strength rules, the
 * session epoch, the throttle, and demo mode only when asked for.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { changeOwnerPassword, createOwner, createSessionToken, readOwner, resetAuthSecretCache, sessionFromCookie, verifyOwnerLogin, verifySessionToken, WrongPasswordError } from "@/lib/auth";
import { currentEpoch, hashPassword, newOwnerRecord, ownerWithPassword, usernameMatches, verifyPassword } from "@/lib/auth/password";
import { COMMON_PASSWORDS, isCommonPassword, PASSWORD_MIN_LENGTH, passwordProblem, passwordRules, usernameProblem, validateCredentials } from "@/lib/auth/rules";
import { clientKey, createThrottle } from "@/lib/auth/throttle";
import { isDemoMode } from "@/lib/config";

let dir: string;
const savedNodeEnv = process.env.NODE_ENV;
/** NODE_ENV is typed read-only; tests need to flip it. */
const setNodeEnv = (value: string | undefined) => { (process.env as Record<string, string | undefined>).NODE_ENV = value; };

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "jollyos-hardening-"));
  process.env.DATA_DIR = dir;
  delete process.env.AUTH_SECRET;
  delete process.env.DEMO_MODE;
  resetAuthSecretCache();
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
  delete process.env.DEMO_MODE;
  setNodeEnv(savedNodeEnv);
  resetAuthSecretCache();
});

const STRONG = "orbit-lantern-quiet-42";

/** The pairs people try first, plus the removed literals (there were none) and empties. */
const DEFAULT_PAIRS: [string, string][] = [
  ["admin", "admin"], ["admin", "password"], ["admin", "admin123"], ["admin", ""], ["root", "root"], ["root", "toor"],
  ["user", "user"], ["user", "password"], ["guest", "guest"], ["test", "test"], ["demo", "demo"],
  ["jollyos", "jollyos"], ["owner", "owner"], ["owner", "password"], ["alex", "alex"], ["alex", "password"], ["alex", "alexrivera"],
  ["", ""], ["", "password"], ["admin", "changeme"], ["admin", "letmein"],
];

describe("no default credentials", () => {
  it("has no built-in account: with no owner, every well-known pair fails", () => {
    for (const [u, p] of DEFAULT_PAIRS) expect(verifyOwnerLogin(u, p), `${u}/${p}`).toBe(false);
  });

  it("still fails in production with DEMO_MODE unset, and there is no anonymous session", async () => {
    setNodeEnv("production");
    for (const [u, p] of DEFAULT_PAIRS) expect(verifyOwnerLogin(u, p), `${u}/${p}`).toBe(false);
    expect(await sessionFromCookie(undefined)).toBeNull();
    expect(await sessionFromCookie("")).toBeNull();
    expect(await sessionFromCookie("not-a-token")).toBeNull();
    createOwner("owner", STRONG);
    for (const [u, p] of DEFAULT_PAIRS) expect(verifyOwnerLogin(u, p), `${u}/${p}`).toBe(false);
    expect(verifyOwnerLogin("owner", STRONG)).toBe(true);
    expect(await sessionFromCookie(undefined)).toBeNull();
  });

  it("rejects non-string input instead of coercing it", () => {
    createOwner("owner", STRONG);
    expect(verifyOwnerLogin(undefined as unknown as string, STRONG)).toBe(false);
    expect(verifyOwnerLogin("owner", { toString: () => STRONG } as unknown as string)).toBe(false);
  });
});

describe("demo mode is explicit", () => {
  it("is on only for DEMO_MODE=true (or 1/yes/on)", () => {
    expect(isDemoMode({})).toBe(false);
    expect(isDemoMode({ DEMO_MODE: undefined })).toBe(false);
    expect(isDemoMode({ DEMO_MODE: "" })).toBe(false);
    expect(isDemoMode({ DEMO_MODE: "false" })).toBe(false);
    expect(isDemoMode({ DEMO_MODE: "0" })).toBe(false);
    expect(isDemoMode({ NODE_ENV: "production" })).toBe(false);
    expect(isDemoMode({ NODE_ENV: "development" })).toBe(false);
    expect(isDemoMode({ DEMO_MODE: "true" })).toBe(true);
    expect(isDemoMode({ DEMO_MODE: " TRUE " })).toBe(true);
    expect(isDemoMode({ DEMO_MODE: "1" })).toBe(true);
  });

  it("never falls back to the demo user when there is no owner", async () => {
    expect(await sessionFromCookie(undefined)).toBeNull();
    setNodeEnv("production");
    expect(await sessionFromCookie(undefined)).toBeNull();
    process.env.DEMO_MODE = "false";
    expect(await sessionFromCookie(undefined)).toBeNull();
  });

  it("signs in as the fictional user only with DEMO_MODE=true", async () => {
    process.env.DEMO_MODE = "true";
    const s = await sessionFromCookie(undefined);
    expect(s?.demo).toBe(true);
    expect(s?.displayName).toBe("Alex Rivera");
  });
});

describe("password rules", () => {
  it(`needs ${PASSWORD_MIN_LENGTH} characters`, () => {
    expect(passwordProblem("a".repeat(PASSWORD_MIN_LENGTH - 1))).toMatch(/12 characters/);
    expect(passwordProblem("a".repeat(PASSWORD_MIN_LENGTH))).toBeNull();
    expect(passwordProblem("")).toMatch(/required/);
    expect(passwordProblem("x".repeat(257))).toMatch(/at most/);
    expect(passwordProblem("tangerine-river-9x")).toBeNull();
  });

  it("refuses common passwords and their usual disguises", () => {
    for (const p of COMMON_PASSWORDS) expect(isCommonPassword(p), p).toBe(true);
    expect(passwordProblem("password1234")).toMatch(/too common/);
    expect(passwordProblem("Password12345!")).toMatch(/too common/);
    expect(passwordProblem("correct horse battery staple")).toMatch(/too common/);
    expect(passwordProblem("Letmein2024!!")).toMatch(/too common/);
    expect(passwordProblem("administrator")).toMatch(/too common/);
    expect(passwordProblem("quiet-harbour-lantern")).toBeNull();
  });

  it("refuses a password that contains the username", () => {
    expect(passwordProblem("rivera-alex-2026!", "alex")).toMatch(/username/);
    expect(passwordProblem("MyNameIsALEX1234", "alex")).toMatch(/username/);
    expect(passwordProblem("alex", "alex")).toMatch(/12 characters/);
    expect(passwordProblem("rivera-alex-2026!", "")).toBeNull();
    expect(passwordProblem("quiet-harbour-lantern", "alex")).toBeNull();
  });

  it("reports every rule for the live checklist", () => {
    const rules = passwordRules("", "");
    expect(rules.map((r) => r.id)).toEqual(["length", "common", "username"]);
    expect(rules.map((r) => r.ok)).toEqual([false, true, true]);
    expect(passwordRules("quiet-harbour-lantern", "alex").every((r) => r.ok)).toBe(true);
    expect(passwordRules("quiet-alex-lantern", "alex").find((r) => r.id === "username")?.ok).toBe(false);
  });

  it("validates usernames", () => {
    expect(usernameProblem("x")).toMatch(/Username/);
    expect(usernameProblem("has space")).toMatch(/Username/);
    expect(usernameProblem("alex.rivera-2")).toBeNull();
    expect(validateCredentials("ok_name", "short")).toMatch(/12 characters/);
    expect(validateCredentials("ok_name", STRONG)).toBeNull();
  });
});

describe("scrypt hashing", () => {
  it("uses a fresh salt, the parameters in the string, and a constant-time compare", () => {
    const a = hashPassword(STRONG);
    const b = hashPassword(STRONG);
    expect(a).not.toBe(b);
    expect(a.split("$").slice(0, 4)).toEqual(["scrypt", "32768", "8", "1"]);
    expect(verifyPassword(STRONG, a)).toBe(true);
    expect(verifyPassword(STRONG, b)).toBe(true);
    expect(verifyPassword(STRONG + " ", a)).toBe(false);
    expect(verifyPassword("", a)).toBe(false);
    expect(verifyPassword(STRONG, "")).toBe(false);
    expect(verifyPassword(STRONG, "scrypt:legacy:format")).toBe(false);
    expect(verifyPassword(STRONG, "scrypt$32768$8$1$zz$zz")).toBe(false);
  });

  it("compares usernames case-insensitively without leaking length", () => {
    expect(usernameMatches("Owner", "owner")).toBe(true);
    expect(usernameMatches("owner ", "owner")).toBe(true);
    expect(usernameMatches("owne", "owner")).toBe(false);
  });

  it("bumps the epoch when the password is replaced", () => {
    const owner = newOwnerRecord("owner", STRONG);
    expect(owner.sessionEpoch).toBe(1);
    const next = ownerWithPassword(owner, "quiet-harbour-lantern");
    expect(next.sessionEpoch).toBe(2);
    expect(next.passwordHash).not.toBe(owner.passwordHash);
    expect(next.passwordChangedAt).toBeTruthy();
    expect(verifyPassword("quiet-harbour-lantern", next.passwordHash)).toBe(true);
    expect(verifyPassword(STRONG, next.passwordHash)).toBe(false);
    expect(currentEpoch({ sessionEpoch: undefined as unknown as number })).toBe(0);
    expect(currentEpoch(null)).toBe(0);
  });
});

describe("change password", () => {
  it("works, keeps this session valid and invalidates every other one", async () => {
    const owner = createOwner("owner", STRONG);
    const otherDevice = await createSessionToken(owner);
    const thisDevice = await createSessionToken(owner);
    expect((await sessionFromCookie(otherDevice))?.username).toBe("owner");

    const updated = changeOwnerPassword(STRONG, "quiet-harbour-lantern");
    expect(updated.sessionEpoch).toBe(2);
    expect(readOwner()?.sessionEpoch).toBe(2);
    expect(verifyOwnerLogin("owner", "quiet-harbour-lantern")).toBe(true);
    expect(verifyOwnerLogin("owner", STRONG)).toBe(false);

    // Tokens from before the change still verify cryptographically but are stale.
    expect((await verifySessionToken(otherDevice))?.epoch).toBe(1);
    expect(await sessionFromCookie(otherDevice)).toBeNull();
    expect(await sessionFromCookie(thisDevice)).toBeNull();
    const reissued = await createSessionToken(updated);
    expect((await sessionFromCookie(reissued))?.username).toBe("owner");
  });

  it("rejects a wrong current password, a weak new one, and the same one again", () => {
    createOwner("owner", STRONG);
    expect(() => changeOwnerPassword("nope-not-it-at-all", "quiet-harbour-lantern")).toThrow(WrongPasswordError);
    expect(() => changeOwnerPassword(STRONG, "short")).toThrow(/12 characters/);
    expect(() => changeOwnerPassword(STRONG, "password12345")).toThrow(/too common/);
    expect(() => changeOwnerPassword(STRONG, "owner-is-my-name-here")).toThrow(/username/);
    expect(() => changeOwnerPassword(STRONG, STRONG)).toThrow(/different/);
    expect(readOwner()?.sessionEpoch).toBe(1);
    expect(verifyOwnerLogin("owner", STRONG)).toBe(true);
  });
});

describe("throttle", () => {
  it("blocks after the limit inside the window and forgets after it", () => {
    const t = createThrottle(5, 1000);
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) {
      expect(t.blocked("k", t0 + i)).toBe(false);
      t.fail("k", t0 + i);
    }
    expect(t.blocked("k", t0 + 10)).toBe(true);
    expect(t.blocked("other", t0 + 10)).toBe(false);
    expect(t.blocked("k", t0 + 1001)).toBe(false);
    t.fail("k", t0 + 2000);
    t.clear("k");
    expect(t.blocked("k", t0 + 2000)).toBe(false);
  });

  it("keys on the forwarded client, else direct", () => {
    expect(clientKey(new Headers({ "x-forwarded-for": "edge-client, inner-hop" }))).toBe("edge-client");
    expect(clientKey(new Headers({ "x-real-ip": "real-client" }))).toBe("real-client");
    expect(clientKey(new Headers())).toBe("direct");
  });
});
