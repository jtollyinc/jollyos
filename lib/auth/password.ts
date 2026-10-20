/**
 * lib/auth/password — scrypt hashing and the owner record, nothing else.
 * ────────────────────────────────────────────────────────────────────────────
 * Pure functions over an OwnerRecord so one implementation serves the setup
 * route, the Password screen and the reset-owner CLI. The CLI imports this
 * file by relative path through Node's type stripping, so: node:crypto only,
 * no "@/" aliases, no Next. Validation lives in ./rules; callers run it first.
 *
 * Hash format  scrypt$N$r$p$<salt hex>$<key hex>
 *   N = 2^15, r = 8, p = 1 (≈32 MiB, tens of milliseconds), 16-byte random
 *   salt per hash, 64-byte key, constant-time compare. The parameters are in
 *   the string so they can be raised later without a migration.
 *
 * sessionEpoch is the session-invalidation counter: every session token
 * carries the epoch it was issued under, and a token whose epoch is not the
 * owner's current one is rejected. Changing or resetting the password bumps
 * it, which signs out every other browser at once. SERVER-SIDE ONLY.
 */
import crypto from "node:crypto";

export const SCRYPT = { N: 1 << 15, r: 8, p: 1, keyLen: 64, saltBytes: 16 } as const;
const MAX_MEM = 64 * 1024 * 1024;

export interface OwnerRecord {
  username: string;
  passwordHash: string;
  createdAt: string;
  /** Bumped on every password change or reset; see the header. */
  sessionEpoch: number;
  passwordChangedAt?: string;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SCRYPT.saltBytes);
  const key = crypto.scryptSync(password, salt, SCRYPT.keyLen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: MAX_MEM });
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("hex"), key.toString("hex")].join("$");
}

function parseHash(stored: string): { N: number; r: number; p: number; salt: Buffer; key: Buffer } | null {
  if (typeof stored !== "string") return null;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [, N, r, p] = parts.slice(0, 4).map(Number);
  if (![N, r, p].every((n) => Number.isInteger(n) && n > 0) || !/^[0-9a-f]+$/i.test(parts[4]) || !/^[0-9a-f]+$/i.test(parts[5])) return null;
  const salt = Buffer.from(parts[4], "hex");
  const key = Buffer.from(parts[5], "hex");
  if (!salt.length || !key.length) return null;
  return { N, r, p, salt, key };
}

/** Constant-time check of a password against a stored hash; false for anything malformed. */
export function verifyPassword(password: string, stored: string): boolean {
  const parsed = parseHash(stored);
  if (!parsed || typeof password !== "string") return false;
  let computed: Buffer;
  try {
    computed = crypto.scryptSync(password, parsed.salt, parsed.key.length, { N: parsed.N, r: parsed.r, p: parsed.p, maxmem: MAX_MEM });
  } catch {
    return false;
  }
  return computed.length === parsed.key.length && crypto.timingSafeEqual(computed, parsed.key);
}

/** Case-insensitive, length-hiding string compare for usernames. */
export function usernameMatches(a: string, b: string): boolean {
  const pa = Buffer.from(a.trim().toLowerCase().padEnd(64, " "));
  const pb = Buffer.from(b.trim().toLowerCase().padEnd(64, " "));
  return pa.length === pb.length && crypto.timingSafeEqual(pa, pb);
}

/** A brand-new owner (epoch 1). Validate with ./rules first. */
export function newOwnerRecord(username: string, password: string, now: Date = new Date()): OwnerRecord {
  return { username: username.trim(), passwordHash: hashPassword(password), createdAt: now.toISOString(), sessionEpoch: 1 };
}

/** The same owner with a new password and the next epoch: every existing session becomes stale. */
export function ownerWithPassword(owner: OwnerRecord, password: string, now: Date = new Date()): OwnerRecord {
  return { ...owner, passwordHash: hashPassword(password), sessionEpoch: currentEpoch(owner) + 1, passwordChangedAt: now.toISOString() };
}

/** The owner's epoch; a record written before epochs existed counts as 0. */
export function currentEpoch(owner: Pick<OwnerRecord, "sessionEpoch"> | null | undefined): number {
  const e = owner?.sessionEpoch;
  return typeof e === "number" && Number.isFinite(e) ? e : 0;
}
