/** The reset-owner CLI's pure parts: argument parsing, the reset plan (same rules, epoch bump), removal. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newOwnerRecord, verifyPassword } from "@/lib/auth/password";
import { parseArgs, planReset, removeOwner } from "@/scripts/reset-owner.mjs";

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "jollyos-reset-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe("reset-owner", () => {
  it("parses its flags", () => {
    expect(parseArgs([])).toEqual({ stdin: false, remove: false, yes: false, help: false, unknown: [] });
    expect(parseArgs(["--stdin"]).stdin).toBe(true);
    expect(parseArgs(["--remove", "--yes"])).toMatchObject({ remove: true, yes: true });
    expect(parseArgs(["--bogus"]).unknown).toEqual(["--bogus"]);
  });

  it("refuses without an owner and applies the same rules as setup", () => {
    expect(planReset(null, "quiet-harbour-lantern")).toMatchObject({ ok: false, error: expect.stringMatching(/No owner/) });
    const owner = newOwnerRecord("owner", "orbit-lantern-quiet-42");
    expect(planReset(owner, "short")).toMatchObject({ ok: false, error: expect.stringMatching(/12 characters/) });
    expect(planReset(owner, "password12345")).toMatchObject({ ok: false, error: expect.stringMatching(/too common/) });
    expect(planReset(owner, "my-owner-password-1")).toMatchObject({ ok: false, error: expect.stringMatching(/username/) });
  });

  it("re-hashes and bumps the epoch so every session is signed out", () => {
    const owner = { ...newOwnerRecord("owner", "orbit-lantern-quiet-42"), sessionEpoch: 4 };
    const plan = planReset(owner, "quiet-harbour-lantern", new Date("2026-10-20T12:00:00Z"));
    expect(plan.ok).toBe(true);
    if (!plan.ok || !plan.record) throw new Error(plan.error ?? "no record");
    expect(plan.record.sessionEpoch).toBe(5);
    expect(plan.record.username).toBe("owner");
    expect(plan.record.passwordHash).not.toBe(owner.passwordHash);
    expect(plan.record.passwordChangedAt).toBe("2026-10-20T12:00:00.000Z");
    expect(verifyPassword("quiet-harbour-lantern", plan.record.passwordHash)).toBe(true);
    expect(verifyPassword("orbit-lantern-quiet-42", plan.record.passwordHash)).toBe(false);
  });

  it("removes the owner file so setup reappears", () => {
    const file = path.join(dir, "owner.json");
    expect(removeOwner(file)).toBe(false);
    fs.writeFileSync(file, "{}");
    expect(removeOwner(file)).toBe(true);
    expect(fs.existsSync(file)).toBe(false);
  });
});
