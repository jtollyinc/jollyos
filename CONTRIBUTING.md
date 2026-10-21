# Contributing

Thanks for looking. JollyOS is small on purpose; the bar for a change is "does
it keep the app calm and keep private data private".

## Setup

```bash
npm ci
DEMO_MODE=true npm run dev   # fictional data, no account: http://localhost:3000
npm run dev                  # the real thing: the first visit asks you to create the owner
```

`cp .env.example .env` is optional; the example has every variable with a
comment. There is no built-in login, so `npm run dev` without `DEMO_MODE=true`
always starts at the setup page.

## Before you open a pull request

```bash
npx tsc --noEmit         # types
npm run lint             # zero errors, aim for zero warnings
npm test                 # Vitest
npm run build
bash scripts/scrub-check.sh --history
```

CI runs the same list plus gitleaks over the full history.

## Ground rules

- **Privacy routing is not optional.** Anything that talks to a model goes
  through `completeWithContext` with tagged segments. Never call a provider
  directly from a module.
- **No personal data in the repo.** Fixtures are fictional and say so. The
  scrub check must stay green; add to `scripts/scrub-terms.txt` rather than
  weakening it.
- **No default credentials, ever.** Not in code, seeds, tests, docs, the
  Dockerfile or `.env.example`. The only account is the one created on the
  setup page; `tests/auth-hardening.test.ts` and `tests/auth-routes.test.ts`
  try the usual pairs and must keep failing. See `docs/security.md`.
- **ADHD-first UI rules** in `docs/design-system.md` apply to every screen:
  44px targets, one loud thing, folded sections that remember.
- **Modules are self-contained.** Read `docs/modules.md`; add one import to
  the manifest list, nothing else in core.
- **Every `lib/` file starts with a header comment** saying what it is for
  and why it exists.
- Keep dependencies few. Prefer a small function over a package.

## Releases

The download on the README is built by `scripts/package-release.sh <target>`
and published by `.github/workflows/release.yml` when a `v*` tag is pushed.
If you change anything the zips carry — the launcher, the standalone payload,
`.env` handling, a new dependency — build and start one before you open the
pull request:

```bash
npm run build
scripts/package-release.sh linux-x64 --out dist --no-build
unzip -q dist/jollyos-*-linux-x64.zip -d /tmp/check
/tmp/check/JollyOS/runtime/bin/node scripts/smoke-release.mjs /tmp/check/JollyOS
```

A new native dependency needs a per-target plan: see "Native modules" in
[docs/releases.md](docs/releases.md).

## Commit style

`type(scope): what changed` — e.g. `feat(brief): atom feed support`,
`fix(auth): clear cookie on logout`. Keep the subject under 72 characters.

## Commit messages (people and AI agents)

- Enable the repo's hooks once per clone: `git config core.hooksPath .githooks`.
- No `Co-Authored-By:` trailers and no email addresses other than `@example.com` in commit messages. The `commit-msg` hook rejects them; CI's history scrub fails on them.
- AI coding agents: turn co-author attribution off (Claude Code: `includeCoAuthoredBy: false`, already set in `.claude/settings.json`; see also `CLAUDE.md`).
