/**
 * lib/auth/throttle — a small in-memory failure counter for the auth routes.
 * ────────────────────────────────────────────────────────────────────────────
 * Counts failures per client key inside a sliding window and says when to
 * answer 429. Only failures count, so a correct password is never slowed by
 * its own history. Per process and per instance: it resets on restart and
 * several replicas each count on their own, which is enough for one owner
 * (docs/security.md says so). Pure apart from the Map, so it is unit-tested.
 */

export interface Throttle {
  /** True when the key has reached the limit inside the window. */
  blocked(key: string, now?: number): boolean;
  /** Record one failure. */
  fail(key: string, now?: number): void;
  /** Forget a key (after a success). */
  clear(key: string): void;
}

export function createThrottle(maxFailures: number, windowMs: number): Throttle {
  const failures = new Map<string, number[]>();
  const recent = (key: string, now: number) => {
    const kept = (failures.get(key) ?? []).filter((t) => now - t < windowMs);
    if (kept.length) failures.set(key, kept); else failures.delete(key);
    return kept;
  };
  return {
    blocked: (key, now = Date.now()) => recent(key, now).length >= maxFailures,
    fail: (key, now = Date.now()) => { failures.set(key, [...recent(key, now), now]); },
    clear: (key) => { failures.delete(key); },
  };
}

/** The client as seen through a reverse proxy, else "direct". */
export function clientKey(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || "direct";
}
