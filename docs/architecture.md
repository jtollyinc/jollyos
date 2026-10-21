# Architecture

JollyOS is a single Next.js app (App Router, TypeScript, Tailwind) for a
single owner. No database, no background workers, no external services unless
you configure a model provider or feed URLs.

```
app/            routes: (auth) setup + login, (app) dashboard pages, api/
components/     jolly/ = design system + shell, modules/ = per-module UI
lib/            everything that is not a page (see below)
modules/<id>/   manifests (and the Decision Deck starter cards)
demo/seed/      fictional seed data for DEMO_MODE
demo/samples/   fictional export files for "Try with sample data"
scripts/        scrub-check.sh + terms, reset-owner, release packaging
scripts/launcher/  the launcher the release zips ship (see docs/releases.md)
tests/          Vitest unit tests (plain Node, no DOM)
```

## Request flow

1. `proxy.ts` runs on every request and applies `lib/auth/gate.ts` (a pure
   function with its own tests). Demo mode passes everything; otherwise it
   redirects to `/setup` (no owner yet) or `/login` (no session), returns 401
   for anonymous API calls, and checks the session's epoch against the owner
   so a password change signs other browsers out at the gate.
2. `app/(app)/layout.tsx` re-checks the session, seeds demo data once, builds
   the nav from the module registry and renders `NavShell`.
3. Pages are server components where they can be (home, settings) and client
   panels where they poll (jobs, brief, deck). API routes are the only writers.

## State

Everything lives under `DATA_DIR` as small JSON/JSONL files written atomically
(`lib/data-dir.ts`):

| File | Owner |
|---|---|
| `owner.json` | `lib/auth` — username, scrypt hash, `sessionEpoch` (mode 600) |
| `auth-secret` | `lib/auth` — generated when `AUTH_SECRET` is unset (mode 600) |
| `modules.json` | `lib/modules/registry` — Settings toggles |
| `jobs.json` | `lib/jobs/store` |
| `persona.json` | `lib/persona/store` |
| `decisions.jsonl`, `private/decisions.jsonl` | `lib/persona/deck-store` — split by privacy |
| `brief.json`, `brief-stories.json` | `lib/brief/build` — day cache (keyed on the interest version) and demo fixtures |
| `brief-feeds.json` | `lib/brief/feeds-store` — the owner's feeds (accepted, picked in the walkthrough, or pasted in); `enabled: false` mutes one without losing it |
| `walkthrough.json` | `lib/onboarding/store` — welcome progress, answers, what it seeded, checklist dismissal |
| `ai-settings.json` | `lib/settings/ai` — the model chosen in the app (mode 600; the key never leaves the server) |
| `interests.json` | `lib/persona/interests-store` — derived interests and avoid-topics (recomputed on every persona write) |
| `imports/queue.json`, `imports/batches.json`, `imports/raw/<batch>/` | `lib/import/queue` — the review queue, one row per import, the uploaded bytes |
| `demo-seeded.json` | `lib/demo` — marker |

## Auth

Single owner, no built-in account. First run creates `owner.json` through the
setup page, which is single-use (`409` afterwards); `/login` then verifies the
scrypt hash and sets an HS256 JWT cookie (`jose`) for 14 days. The token
carries the owner's `sessionEpoch`; changing the password (Settings →
Password, `POST /api/auth/password`) or running `npm run reset-owner` bumps
it, which rejects every other session. `DEMO_MODE=true`, and only that,
replaces all of this with the fictional demo user. Failures are throttled in
memory (login 8, password change 5, per 15 minutes per client).

The pieces: `lib/auth/rules.ts` (the password and username rules, client-safe
so the forms show them live), `lib/auth/password.ts` (scrypt and the owner
record, pure), `lib/auth/gate.ts` (the request-gate decision, pure),
`lib/auth/throttle.ts`, and `lib/auth/index.ts` (the owner file, tokens,
sessions). `scripts/reset-owner.mjs` imports the first two by relative path,
so they must stay free of `@/` imports. `docs/security.md` has the operator's
view.

## Provider adapter and the privacy rule

`lib/providers/` exposes one interface (`Provider.complete`, optional
`stream`) with four implementations: Anthropic (official SDK), OpenAI, a local
OpenAI-compatible server, and a deterministic in-process demo. `providersFromEnv`
picks the default (`LLM_PROVIDER`, else first configured key, else demo) and
always fills the `local` slot when `LOCAL_LLM_BASE_URL` is set.

Every prompt is built from `ContextSegment`s tagged `public | cloud-ok |
local-only`. `routeSegments` applies the rule:

1. no local-only segment → default provider gets everything;
2. local-only present and a local provider exists → the **local** provider
   gets everything;
3. local-only present and no local provider → the local-only segments are
   **dropped before anything is sent**, and the decision (`dropped`, `reason`)
   is returned so the UI can say so.

The demo provider is deliberately *not* treated as local, so the rule is
visible in the mode people try first. The rule is pure and covered by
`tests/providers-routing.test.ts`.

## Modules

See `docs/modules.md`. In short: a manifest per folder, one import in
`lib/modules/manifests.ts`, `computeStatuses` derives ready / needs-setup /
disabled, and `gateModule` protects each page.

## Jobs runners

`lib/jobs/runners/` is a registry of who executes a card: `api` (your key,
through the provider router), `cli` (`codex` or `claude` on PATH, detached
child process, `JOBS_CLI_CWD`), `local` (your OpenAI-compatible server,
`localProvider`) and `demo` (progress is a function of elapsed time computed
on read — `settle` in the store — so nothing runs in the background). Each
runner is one file exporting `{ manifest, health(env), start(job, env) }`;
the manifests live client-safe in `lib/jobs/types.ts` with the one routing
rule, `resolveRunner`: Auto → `defaultRunner(env)`, private → `local`, else
the pick. `runJob` in `runners/index.ts` resolves, gates on health (Local
down → the card is **blocked** with the reason; api/cli not set up → 409) and
starts. `docs/runners.md` has the table and the "add a runner" steps.

## Daily Brief

`lib/brief/build.ts` collects stories (RSS via `lib/brief/rss.ts` from
`BRIEF_FEEDS` plus the owner's switched-on feeds, or demo fixtures), ranks them by the
derived interest profile (`lib/persona/interests.ts`: boost on matched
interests, hide on avoid-topics, a why-line per story), writes one section per
source with a persona-aware summary through the router, adds model-free
sections for jobs and decisions, proposes feeds from `lib/brief/feed-catalog.json`
(`suggestFeeds` is pure; only `POST /api/brief/feeds` subscribes), and caches
the result per day keyed on the interest version.

Privacy: ranking is keyword matching on the server, so local-only interests may
rank. They are never put into a prompt body; each interest is a tagged
`ContextSegment`, so the router withholds the local-only ones from a cloud
model, and the story-list annotations only name cloud-safe interests.

## Importing context

`lib/import/` turns an export into candidate persona items:

1. `parse.ts` expands zips (`zip.ts`, no dependency), sniffs JSON by shape and
   routes to `parsers/chatgpt` (the `mapping` tree, active branch, user turns
   only), `parsers/claude` (`chat_messages`, human turns; `projects.json`
   instructions), `parsers/gemini` (Takeout activity rows titled "Prompted …"),
   `parsers/markdown` (paragraphs and list items; front matter, code and
   tables skipped) and `parsers/paste` (memory / instruction sections).
2. `extract.ts` is the rule-based extractor (deterministic patterns, first
   match wins, confidence per hit). `modes.ts` adds the local-model and the
   cloud modes and holds the gate, `authorizeExtraction`: local needs a local
   provider (else 409), cloud needs `cloudOptIn` (else 403). Both model modes
   go through the normal router with the text tagged local-only / cloud-ok.
3. `run.ts` runs one import end to end and is what `POST /api/import` calls;
   `queue.ts` stores the review queue and the raw uploads under
   `DATA_DIR/imports/`. `reviewCandidate(id, "approve")` is the only path into
   the persona (`addEntry` with the source attached), which re-derives the
   interests. `samples.ts` queues the fictional `demo/samples/` in demo mode.

The page is `components/modules/Persona/ImportPanel.tsx` (source → add &
extract → review); the platform how-tos live in `lib/import/sources.ts` and
`docs/importing-context.md`.

## Build and deploy

`next.config.mjs` sets `output: "standalone"`, which both ways of shipping
JollyOS consume. `scripts/package-release.sh` wraps that build and an official
Node 22 runtime into the per-OS double-click zips on the Releases page
(`docs/releases.md`); the Dockerfile copies the same output into a non-root
`node:22-alpine` image with `/data` as the volume.
`docker-compose.yml` binds `127.0.0.1:3000` and defaults to demo mode. The
image also carries `scripts/reset-owner.mjs` with the two auth files it
imports and `package.json`, so `docker compose exec jollyos npm run
reset-owner` works inside the container.
