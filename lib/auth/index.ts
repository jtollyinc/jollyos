/**
 * lib/auth — single-owner authentication.
 * ────────────────────────────────────────────────────────────────────────────
 * JollyOS has exactly one user: the owner. There is no user table, no roles,
 * no sign-up. The flow is:
 *
 *   first run  → no owner file in DATA_DIR → every page redirects to /setup,
 *                where a username + password are chosen once.
 *   afterwards → /login checks the password against the scrypt hash in
 *                DATA_DIR/owner.json and sets a signed JWT session cookie.
 *   demo mode  → no owner needed; every request is the fictional demo user.
 *
 * The JWT is HS256 (jose) signed with AUTH_SECRET. When the variable is unset
 * a random secret is generated once into DATA_DIR/auth-secret, so a plain
 * `docker compose up` works without configuration but still has a real secret.
 *
 * Passwords are hashed with scrypt from Node's crypto (no native build step).
 * SERVER-SIDE ONLY.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { SignJWT, jwtVerify } from "jose";
import { dataPath, fileExists, readJson, writeJson } from "@/lib/data-dir";
import { isDemoMode } from "@/lib/config";

export const SESSION_COOKIE = "jollyos_session";
const SESSION_DAYS = 14;

/** The fictional user demo mode signs in as. Not a real person. */
export const DEMO_USER = {
  username: "alex",
  displayName: "Alex Rivera",
  tagline: "product designer · fictional demo user",
} as const;

export interface Session {
  username: string;
  displayName: string;
  demo: boolean;
}

// ── Password hashing ───────────────────────────────────────────────────────

const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, KEY_LEN).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, expected] = parts;
  const computed = crypto.scryptSync(password, salt, KEY_LEN);
  const a = Buffer.from(expected, "hex");
  if (a.length !== computed.length) return false;
  return crypto.timingSafeEqual(a, computed);
}

// ── Owner file ─────────────────────────────────────────────────────────────

interface OwnerRecord {
  username: string;
  passwordHash: string;
  createdAt: string;
}

const ownerFile = () => dataPath("owner.json");

export function ownerExists(): boolean {
  return fileExists(ownerFile());
}

export function readOwner(): OwnerRecord | null {
  return readJson<OwnerRecord | null>(ownerFile(), null);
}

export class AuthError extends Error {}

/** Validate what the setup form sends. Returns a message or null when fine. */
export function validateCredentials(username: string, password: string): string | null {
  if (!/^[a-z0-9_.-]{2,32}$/i.test(username)) return "Username: 2-32 letters, digits, dots, dashes or underscores.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 256) return "Password is too long.";
  return null;
}

/** First-run only: refuses when an owner already exists. */
export function createOwner(username: string, password: string): OwnerRecord {
  if (ownerExists()) throw new AuthError("An owner already exists.");
  const problem = validateCredentials(username, password);
  if (problem) throw new AuthError(problem);
  const record: OwnerRecord = {
    username: username.trim(),
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  writeJson(ownerFile(), record);
  return record;
}

/** Constant-time-ish login check; false for a missing owner too. */
export function verifyOwnerLogin(username: string, password: string): boolean {
  const owner = readOwner();
  if (!owner) return false;
  const a = Buffer.from(username.trim().toLowerCase().padEnd(64, " "));
  const b = Buffer.from(owner.username.toLowerCase().padEnd(64, " "));
  const nameOk = a.length === b.length && crypto.timingSafeEqual(a, b);
  const passOk = verifyPassword(password, owner.passwordHash);
  return nameOk && passOk;
}

export function changeOwnerPassword(current: string, next: string): void {
  const owner = readOwner();
  if (!owner) throw new AuthError("No owner yet.");
  if (!verifyPassword(current, owner.passwordHash)) throw new AuthError("Current password is wrong.");
  const problem = validateCredentials(owner.username, next);
  if (problem) throw new AuthError(problem);
  writeJson(ownerFile(), { ...owner, passwordHash: hashPassword(next) });
}

// ── Session secret ─────────────────────────────────────────────────────────

let cachedSecret: Uint8Array | null = null;

/** AUTH_SECRET from the environment, else a generated one in DATA_DIR. */
export function getAuthSecret(): Uint8Array {
  const fromEnv = process.env.AUTH_SECRET?.trim();
  if (fromEnv) return new TextEncoder().encode(fromEnv);
  if (cachedSecret) return cachedSecret;
  const file = dataPath("auth-secret");
  let value: string;
  try {
    value = fs.readFileSync(file, "utf8").trim();
  } catch {
    value = "";
  }
  if (!value) {
    value = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(file, value + "\n", { encoding: "utf8", mode: 0o600 });
  }
  cachedSecret = new TextEncoder().encode(value);
  return cachedSecret;
}

/** Tests swap DATA_DIR; let them forget a cached secret. */
export function resetAuthSecretCache(): void {
  cachedSecret = null;
}

// ── Session tokens ─────────────────────────────────────────────────────────

export async function createSessionToken(username: string): Promise<string> {
  return new SignJWT({ sub: username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getAuthSecret());
}

export async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    return typeof payload.sub === "string" && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

export function cookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}

/** Resolve a session from a raw cookie value (null when absent/invalid). */
export async function sessionFromCookie(token: string | undefined): Promise<Session | null> {
  if (isDemoMode()) {
    return { username: DEMO_USER.username, displayName: DEMO_USER.displayName, demo: true };
  }
  if (!token) return null;
  const username = await verifySessionToken(token);
  if (!username) return null;
  const owner = readOwner();
  if (!owner || owner.username !== username) return null;
  return { username, displayName: username, demo: false };
}
