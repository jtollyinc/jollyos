/**
 * lib/auth — single-owner authentication.
 * ────────────────────────────────────────────────────────────────────────────
 * JollyOS has exactly one user: the owner. There is no user table, no roles,
 * no sign-up, and no built-in account: nothing can sign in until the owner
 * has been created. The flow is:
 *
 *   first run  → no owner.json in DATA_DIR → every page redirects to /setup,
 *                where a username + password are chosen once. Once the owner
 *                exists the setup route answers 409 forever (no takeover).
 *   afterwards → /login checks the password against the scrypt hash in
 *                DATA_DIR/owner.json and sets a signed JWT session cookie.
 *   demo mode  → only when DEMO_MODE=true is set explicitly: every request is
 *                the fictional demo user and there is no owner at all. A
 *                missing owner or a missing .env never turns demo on.
 *
 * The JWT is HS256 (jose) signed with AUTH_SECRET. When the variable is unset
 * a random secret is generated once into DATA_DIR/auth-secret (mode 600), so a
 * plain `docker compose up` works without configuration but still has a real
 * secret. Tokens carry the owner's sessionEpoch; a password change or a CLI
 * reset bumps it, which rejects every token issued before.
 *
 * Hashing and the record shape live in ./password, the rules in ./rules, the
 * gate decision in ./gate. SERVER-SIDE ONLY.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { SignJWT, jwtVerify } from "jose";
import { dataPath, fileExists, readJson, writeJson } from "@/lib/data-dir";
import { isDemoMode } from "@/lib/config";
import { currentEpoch, newOwnerRecord, ownerWithPassword, usernameMatches, verifyPassword, type OwnerRecord } from "./password";
import { passwordProblem, validateCredentials } from "./rules";

export { hashPassword, verifyPassword, currentEpoch, type OwnerRecord } from "./password";
export { passwordProblem, passwordRules, usernameProblem, validateCredentials, PASSWORD_MIN_LENGTH } from "./rules";

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

// ── Owner file ─────────────────────────────────────────────────────────────

const ownerFile = () => dataPath("owner.json");
/** owner.json holds the hash: owner-only permissions, like auth-secret. */
export const OWNER_FILE_MODE = 0o600;

export function ownerExists(): boolean {
  return fileExists(ownerFile());
}

export function readOwner(): OwnerRecord | null {
  const owner = readJson<OwnerRecord | null>(ownerFile(), null);
  return owner && typeof owner.username === "string" && typeof owner.passwordHash === "string" ? owner : null;
}

export class AuthError extends Error {}

/** First-run only: refuses when an owner already exists. */
export function createOwner(username: string, password: string): OwnerRecord {
  if (ownerExists()) throw new AuthError("An owner already exists.");
  const problem = validateCredentials(username, password);
  if (problem) throw new AuthError(problem);
  const record = newOwnerRecord(username, password);
  writeJson(ownerFile(), record, OWNER_FILE_MODE);
  return record;
}

/** Username (case-insensitive) and password both have to match; false for a missing owner too. */
export function verifyOwnerLogin(username: string, password: string): boolean {
  const owner = readOwner();
  if (!owner || typeof username !== "string" || typeof password !== "string") return false;
  const nameOk = usernameMatches(username, owner.username);
  const passOk = verifyPassword(password, owner.passwordHash);
  return nameOk && passOk;
}

/** Thrown by changeOwnerPassword when the current password is wrong (the throttled case). */
export class WrongPasswordError extends AuthError {}

/**
 * Verify the current password, apply the rules to the new one, re-hash and
 * bump the epoch. Returns the new record so the caller can re-issue its own
 * session; every other session is stale from here on.
 */
export function changeOwnerPassword(current: string, next: string): OwnerRecord {
  const owner = readOwner();
  if (!owner) throw new AuthError("No owner yet.");
  if (!verifyPassword(current, owner.passwordHash)) throw new WrongPasswordError("Current password is wrong.");
  const problem = passwordProblem(next, owner.username);
  if (problem) throw new AuthError(problem);
  if (verifyPassword(next, owner.passwordHash)) throw new AuthError("New password must be different from the current one.");
  const updated = ownerWithPassword(owner, next);
  writeJson(ownerFile(), updated, OWNER_FILE_MODE);
  return updated;
}

// ── Session secret ─────────────────────────────────────────────────────────

let cachedSecret: Uint8Array | null = null;

/** AUTH_SECRET from the environment, else a generated one in DATA_DIR/auth-secret (mode 600). */
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

export interface SessionClaims {
  username: string;
  epoch: number;
}

/** Sign a session for this owner under their current epoch. */
export async function createSessionToken(owner: Pick<OwnerRecord, "username" | "sessionEpoch">): Promise<string> {
  return new SignJWT({ sub: owner.username, epoch: currentEpoch(owner) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getAuthSecret());
}

/** Signature, expiry and shape only; the owner/epoch check is sessionFromCookie. */
export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    if (typeof payload.sub !== "string" || !payload.sub || typeof payload.epoch !== "number") return null;
    return { username: payload.sub, epoch: payload.epoch };
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

/**
 * Resolve a session from a raw cookie value: null when absent, invalid, for a
 * username that is not the owner, or issued under an older epoch. Demo mode
 * (explicit DEMO_MODE=true only) is always the fictional user.
 */
export async function sessionFromCookie(token: string | undefined): Promise<Session | null> {
  if (isDemoMode()) {
    return { username: DEMO_USER.username, displayName: DEMO_USER.displayName, demo: true };
  }
  if (!token) return null;
  const claims = await verifySessionToken(token);
  if (!claims) return null;
  const owner = readOwner();
  if (!owner || owner.username !== claims.username || claims.epoch !== currentEpoch(owner)) return null;
  return { username: owner.username, displayName: owner.username, demo: false };
}
