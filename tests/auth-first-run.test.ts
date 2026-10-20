import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOwner, createSessionToken, ownerExists, resetAuthSecretCache, sessionFromCookie, verifyOwnerLogin, verifySessionToken } from "@/lib/auth";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "jollyos-auth-"));
  process.env.DATA_DIR = dir;
  delete process.env.AUTH_SECRET;
  delete process.env.DEMO_MODE;
  resetAuthSecretCache();
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
  resetAuthSecretCache();
});

describe("first run", () => {
  it("starts with no owner, creates one, then refuses a second", () => {
    expect(ownerExists()).toBe(false);
    const owner = createOwner("owner", "correct horse battery");
    expect(owner.username).toBe("owner");
    expect(ownerExists()).toBe(true);
    expect(() => createOwner("someone", "another password")).toThrow(/already exists/);
    const stored = JSON.parse(fs.readFileSync(path.join(dir, "owner.json"), "utf8")) as { passwordHash: string };
    expect(stored.passwordHash.startsWith("scrypt:")).toBe(true);
    expect(stored.passwordHash).not.toContain("correct horse");
  });

  it("validates the credentials", () => {
    expect(() => createOwner("x", "long enough password")).toThrow(/Username/);
    expect(() => createOwner("owner", "short")).toThrow(/8 characters/);
  });

  it("verifies the password and nothing else", () => {
    createOwner("owner", "correct horse battery");
    expect(verifyOwnerLogin("owner", "correct horse battery")).toBe(true);
    expect(verifyOwnerLogin("Owner", "correct horse battery")).toBe(true);
    expect(verifyOwnerLogin("owner", "wrong")).toBe(false);
    expect(verifyOwnerLogin("other", "correct horse battery")).toBe(false);
  });

  it("generates a secret into DATA_DIR and round-trips a session token", async () => {
    createOwner("owner", "correct horse battery");
    const token = await createSessionToken("owner");
    expect(fs.existsSync(path.join(dir, "auth-secret"))).toBe(true);
    expect(await verifySessionToken(token)).toBe("owner");
    expect(await verifySessionToken(token + "x")).toBeNull();
    const session = await sessionFromCookie(token);
    expect(session?.username).toBe("owner");
    expect(session?.demo).toBe(false);
    expect(await sessionFromCookie(undefined)).toBeNull();
  });

  it("uses AUTH_SECRET from the environment when set", async () => {
    process.env.AUTH_SECRET = "test-secret-not-for-production";
    createOwner("owner", "correct horse battery");
    const token = await createSessionToken("owner");
    expect(fs.existsSync(path.join(dir, "auth-secret"))).toBe(false);
    expect(await verifySessionToken(token)).toBe("owner");
  });

  it("demo mode signs everyone in as the fictional user without an owner", async () => {
    process.env.DEMO_MODE = "true";
    const session = await sessionFromCookie(undefined);
    expect(session?.demo).toBe(true);
    expect(session?.displayName).toBe("Alex Rivera");
  });
});
