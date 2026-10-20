/** The request gate as a pure function: setup forced, setup single-use, demo explicit. */
import { describe, expect, it } from "vitest";
import { gate, type GateDecision } from "@/lib/auth/gate";

const yes = async () => true;
const no = async () => false;
const never = async () => { throw new Error("session should not be checked"); };
const run = (pathname: string, demo: boolean, ownerExists: boolean, hasSession = no): Promise<GateDecision> => gate({ pathname, demo, ownerExists, hasSession });

describe("gate: no owner yet", () => {
  it("sends every page to /setup and answers 401 to every API", async () => {
    for (const p of ["/", "/jobs", "/settings", "/settings/password", "/login", "/persona/import"]) {
      expect(await run(p, false, false, never), p).toEqual({ kind: "redirect", to: "/setup" });
    }
    for (const p of ["/api/jobs", "/api/auth/login", "/api/auth/me", "/api/auth/password", "/api/persona"]) {
      expect(await run(p, false, false, never), p).toEqual({ kind: "unauthorized", error: "Setup required" });
    }
  });

  it("lets setup and health through", async () => {
    for (const p of ["/setup", "/api/auth/setup", "/api/health"]) expect(await run(p, false, false, never), p).toEqual({ kind: "next" });
  });
});

describe("gate: owner exists", () => {
  it("closes setup for good", async () => {
    expect(await run("/setup", false, true, never)).toEqual({ kind: "redirect", to: "/login" });
    expect(await run("/setup", false, true, yes)).toEqual({ kind: "redirect", to: "/login" });
    // /api/auth/setup itself answers 409 in the route handler; the gate passes auth APIs through.
    expect(await run("/api/auth/setup", false, true, never)).toEqual({ kind: "next" });
  });

  it("sends anonymous pages to login with the destination, 401s anonymous APIs", async () => {
    expect(await run("/", false, true)).toEqual({ kind: "redirect", to: "/login" });
    expect(await run("/jobs", false, true)).toEqual({ kind: "redirect", to: "/login?next=%2Fjobs" });
    expect(await run("/settings/password", false, true)).toEqual({ kind: "redirect", to: "/login?next=%2Fsettings%2Fpassword" });
    expect(await run("/api/jobs", false, true)).toEqual({ kind: "unauthorized", error: "Unauthorized" });
    expect(await run("/api/auth/password", false, true, never)).toEqual({ kind: "next" }); // handler checks the session
    expect(await run("/login", false, true, never)).toEqual({ kind: "next" });
    expect(await run("/api/health", false, true, never)).toEqual({ kind: "next" });
  });

  it("passes a valid session", async () => {
    expect(await run("/", false, true, yes)).toEqual({ kind: "next" });
    expect(await run("/api/jobs", false, true, yes)).toEqual({ kind: "next" });
  });
});

describe("gate: demo mode", () => {
  it("passes everything without a session and bounces the entry pages home", async () => {
    expect(await run("/", true, false, never)).toEqual({ kind: "next" });
    expect(await run("/api/jobs", true, false, never)).toEqual({ kind: "next" });
    expect(await run("/setup", true, false, never)).toEqual({ kind: "redirect", to: "/" });
    expect(await run("/login", true, true, never)).toEqual({ kind: "redirect", to: "/" });
  });
});
