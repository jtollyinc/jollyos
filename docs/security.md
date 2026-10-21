# Security

JollyOS is a self-hosted dashboard for **one owner**. This page is how the
account works, where the secrets live, and what is deliberately out of scope,
so you can decide how to run it.

## No default credentials

There is no built-in account, no seed user, no environment-variable fallback
login. Nothing can sign in until the owner has been created on the setup
page, and `tests/auth-hardening.test.ts` plus `tests/auth-routes.test.ts`
keep trying the usual pairs (`admin`/`admin` and friends, empty, the demo
name) in development and in `NODE_ENV=production` to make sure they fail.

Demo mode is the one exception and it is explicit: `DEMO_MODE` must be exactly
`true` (or `1`, `yes`, `on`). Unset, empty, `false`, a missing `.env`, a
missing owner — none of these turn it on. In demo mode there is no owner and
no password at all, so never put a demo instance on the internet.

## First-run setup

With no `DATA_DIR/owner.json`, every page redirects to `/setup` and every API
except `/api/auth/setup` and `/api/health` answers `401`. The page asks for a
username and a password twice and shows the rules live:

- at least 12 characters (up to 256; spaces are fine);
- not on the short common-password list in `lib/auth/rules.ts`, also when
  disguised with capitals, spaces or a tail of digits and symbols;
- not containing the username.

The server enforces the same rules (`lib/auth/rules.ts` is the only copy).
Setup is **single-use**: once the owner exists, `/setup` redirects to `/login`
and the route answers `409` forever. There is no takeover path through it.

## Where the hash lives

`DATA_DIR/owner.json`, written with mode `600`:

```json
{
  "username": "…",
  "passwordHash": "scrypt$32768$8$1$<salt hex>$<key hex>",
  "createdAt": "…",
  "sessionEpoch": 1,
  "passwordChangedAt": "…"
}
```

scrypt from Node's `crypto` with N = 2^15, r = 8, p = 1 (about 32 MiB and
tens of milliseconds per check), a random 16-byte salt per hash, a 64-byte
key, compared in constant time. The parameters are stored in the string so
they can be raised later without a migration. Usernames are compared
case-insensitively with a length-hiding compare.

## The model key you type into the app

The welcome walkthrough's "AI brain" screen can store a hosted API key so a
one-click install needs no `.env`. It lands in `DATA_DIR/ai-settings.json` with
mode `600`, the same treatment as `owner.json` and `auth-secret`.

No API route ever answers with the value: `publicAiSettings` returns
`apiKeySet` and a four-character hint (`…a1b2`), and the Test endpoint returns
one sentence. The environment still wins — a key in `.env` is never overridden
by one typed into the app (`runtimeEnv()`, `lib/settings/ai.ts`). Demo mode
tests a key and then throws it away rather than writing it.

Proof: `tests/ai-settings.test.ts`.

## Sessions

A signed HS256 JWT (`jose`) in an `HttpOnly`, `SameSite=Lax` cookie
(`Secure` on https), valid 14 days. It carries the username and the owner's
`sessionEpoch`; the gate (`lib/auth/gate.ts` via `proxy.ts`) and every route
check both against `owner.json`, so a token for the wrong user or an older
epoch is rejected.

`AUTH_SECRET` signs it. Leave it unset and a random 32-byte secret is
generated once into `DATA_DIR/auth-secret` (mode `600`). Set it yourself when
you run more than one replica. Changing it signs everyone out.

## Changing and resetting the password

**Settings → Change password** asks for the current password and the new one
twice, with the rules live. On success the hash is replaced, `sessionEpoch`
is bumped (every other browser and device is signed out immediately) and the
current browser gets a fresh cookie so it stays signed in.

**Locked out:** from a shell on the machine or in the container:

```bash
npm run reset-owner                      # prompts for the new password, twice, hidden
npm run reset-owner -- --stdin           # reads it from the first line of stdin
npm run reset-owner -- --remove          # deletes the owner; setup reappears (asks "yes")
npm run reset-owner -- --remove --yes    # the same without the question

docker compose exec -it jollyos npm run reset-owner
printf '%s\n' 'a new long password' | docker compose exec -T jollyos npm run reset-owner -- --stdin
docker compose exec -it jollyos npm run reset-owner -- --remove
```

It applies the same rules as setup, re-hashes, bumps the epoch, and never
prints the password. It reads `DATA_DIR` from the environment, else `.env`,
else `./data`. Shell access is the whole access control here: whoever can
read `DATA_DIR` already owns the instance.

## Rate limits

In memory, per process, counted only on failure so a correct password is
never slowed by its own history:

| Route | Limit |
|---|---|
| `POST /api/auth/login` | 8 wrong attempts per 15 minutes per client |
| `POST /api/auth/password` | 5 wrong current passwords per 15 minutes per client |

The client is the first `X-Forwarded-For` address, else `X-Real-IP`, else one
shared bucket. Put a reverse proxy in front that sets those headers and strips
them from the outside, or everybody shares the bucket, which is safe but
coarse. The counters reset when the process restarts; with several replicas
each counts on its own. For one owner that is enough; for anything else, add
limits at the proxy.

## Out of scope, on purpose

- No second user, no roles, no sign-up.
- No two-factor authentication. Put the instance behind your VPN or an
  identity-aware proxy if you want a second factor.
- No password-reset by e-mail: there is no e-mail. The reset is the CLI above.
- No CSRF tokens: the cookie is `SameSite=Lax`, every writing route takes a
  JSON body, and the API answers `401` without a session.

## Reporting

Open a private security advisory on the repository rather than a public
issue. Do not include personal data in the report.
