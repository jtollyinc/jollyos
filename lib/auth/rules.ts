/**
 * lib/auth/rules — the username and password rules, in one place.
 * ────────────────────────────────────────────────────────────────────────────
 * Shared by the setup form, the Password screen, the API routes and the
 * reset-owner CLI, so what a form shows live is exactly what the server
 * enforces. Client-safe on purpose: no imports, no crypto. The CLI
 * (`scripts/reset-owner.mjs`) imports this file by relative path through
 * Node's type stripping, so it must stay free of "@/" aliases.
 *
 * The rules: at least 12 characters, not on the common-password list, and not
 * containing the username. That is deliberately all; length does more for
 * strength than character-class rules do, and the owner is the only user.
 */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;
export const USERNAME_RE = /^[a-z0-9_.-]{2,32}$/i;

/**
 * Passwords nobody gets to choose: the usual suspects plus the long ones that
 * slip past a length rule. Compared lower-cased, with spaces removed and with
 * trailing digits/punctuation stripped, so "Password12345!" is still "password".
 */
export const COMMON_PASSWORDS: readonly string[] = [
  "password", "passw0rd", "password1", "password123", "password1234", "passwordpassword",
  "123456", "1234567", "12345678", "123456789", "1234567890", "12345678910", "123456789012",
  "qwerty", "qwertyuiop", "qwerty123", "qwertyuiop123", "qwertyuiopasdfghjkl", "1q2w3e4r", "1q2w3e4r5t",
  "abc123", "abcdefghijkl", "abcd1234", "asdfghjkl", "zxcvbnm",
  "admin", "admin123", "administrator", "root", "toor", "user", "guest", "test", "test1234",
  "changeme", "changeme123", "letmein", "letmein123", "welcome", "welcome1", "welcome123",
  "iloveyou", "iloveyou123", "monkey", "dragon", "sunshine", "princess", "football", "baseball",
  "trustno1", "secret", "secret123", "superman", "batman", "master", "login", "default",
  "correcthorsebatterystaple", "jollyos", "jollyos123", "alexrivera", "demo", "demo1234", "demodemo",
  "111111", "000000", "121212", "123123", "654321", "696969", "aaaaaa",
];

const COMMON = new Set(COMMON_PASSWORDS);

/** Normalise the way people "strengthen" a bad password: case, spaces, a tail of digits or symbols. */
function commonForms(password: string): string[] {
  const squashed = password.toLowerCase().replace(/\s+/g, "");
  const stripped = squashed.replace(/[^a-z]+$/, "");
  return stripped.length >= 4 && stripped !== squashed ? [squashed, stripped] : [squashed];
}

export function isCommonPassword(password: string): boolean {
  return commonForms(password).some((form) => COMMON.has(form));
}

export interface PasswordRule {
  id: "length" | "common" | "username";
  /** Shown as-is in the forms. */
  label: string;
  ok: boolean;
}

/** Every rule with its current state, for a live checklist. Username may be empty (not typed yet). */
export function passwordRules(password: string, username = ""): PasswordRule[] {
  const user = username.trim().toLowerCase();
  return [
    { id: "length", label: `At least ${PASSWORD_MIN_LENGTH} characters`, ok: password.length >= PASSWORD_MIN_LENGTH },
    { id: "common", label: "Not a common password", ok: !isCommonPassword(password) },
    { id: "username", label: "Does not contain your username", ok: user.length < 2 || !password.toLowerCase().includes(user) },
  ];
}

const RULE_PROBLEMS: Record<PasswordRule["id"], string> = {
  length: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
  common: "That password is too common. Pick something only you would think of.",
  username: "Password must not contain your username.",
};

/** The first thing wrong with a password, or null when it passes every rule. */
export function passwordProblem(password: string, username = ""): string | null {
  if (typeof password !== "string" || password.length === 0) return "Password is required.";
  if (password.length > PASSWORD_MAX_LENGTH) return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
  const failed = passwordRules(password, username).find((r) => !r.ok);
  return failed ? RULE_PROBLEMS[failed.id] : null;
}

export function usernameProblem(username: string): string | null {
  if (typeof username !== "string" || !USERNAME_RE.test(username.trim())) return "Username: 2-32 letters, digits, dots, dashes or underscores.";
  return null;
}

/** Validate what the setup form sends. Returns a message or null when fine. */
export function validateCredentials(username: string, password: string): string | null {
  return usernameProblem(username) ?? passwordProblem(password, username);
}
