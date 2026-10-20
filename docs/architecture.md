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
scripts/        scrub-check.sh + its banned-terms list
tests/          Vitest unit tests (plain Node, no DOM)
```

## Request flow

1. `proxy.ts` runs on every request. Demo mode passes everything; otherwise
   it redirects to `/setup` (no owner yet) or `/login` (no session), and
   returns 401 for anonymous API calls.
2. `app/(app)/layout.tsx` re-checks the session, seeds demo data once, builds
   the nav from the module registry and renders `NavShell`.
3. Pages are server components where they can be (home, settings) and client
   panels where they poll (jobs, brief, deck). API routes are the only writers.

## State

Everything lives under `DATA_DIR` as small JSON/JSONL files written atomically
(`lib/data-dir.ts`):

| File | Owner |
|---|---|
| `owner.json` | `lib/auth` — username + scrypt hash |
| `auth-secret` | `lib/auth` — generated when `AUTH_SECRET` is unset |
| `modules.json` | `lib/modules/registry` — Settings toggles |
| `jobs.json` | `lib/jobs/store` |
| `persona.json` | `lib/persona/store` |
| `decisions.jsonl`, `private/decisions.jsonl` | `lib/persona/deck-store` — split by privacy |
| `brief.json`, `brief-stories.json` | `lib/brief/build` — day cache and demo fixtures |
| `demo-seeded.json` | `lib/demo` — marker |

## Auth

Single owner. First run creates `owner.json`; afterwards `/login` verifies the
scrypt hash and sets an HS256 JWT cookie (`jose`) for 14 days. `DEMO_MODE`
replaces all of this with the fictional demo user. Login failures are
throttled in memory (8 per 15 minutes per client).

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

`lib/brief/build.ts` collects stories (RSS via `lib/brief/rss.ts`, or demo
fixtures), writes one section per source with a persona-aware summary through
the router, adds model-free sections for jobs and decisions, and caches the
result per day.

## Build and deploy

`next.config.mjs` sets `output: "standalone"`; the Dockerfile copies that
output into a non-root `node:22-alpine` image with `/data` as the volume.
`docker-compose.yml` binds `127.0.0.1:3000` and defaults to demo mode.
