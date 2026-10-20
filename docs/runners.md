# Job runners — who executes a job

A **runner** is the thing that executes a whole card from the Jobs board: your
API provider, an agent CLI on the machine, a local model server, or the demo
simulator. It is **not** a model picker — which model answers inside a runner
is still decided by `lib/providers` (the privacy router and the per-provider
adapters), and the runners reuse that instead of duplicating it.

Code: `lib/jobs/runners/` (one file per runner), `lib/jobs/types.ts` (the
manifests and the rule), `lib/config.ts` (`defaultRunner`). Tests:
`tests/jobs-runners.test.ts`.

## The picker: one control, one rule

The new-job sheet (and the card drawer) has one **Runner** control — **Auto ·
API · CLI · Local · Demo** — plus a **Private** lock. Each option shows its cost
class ($0 / plan / credits) and a health line (ready · needs setup ·
unreachable). The policy behind it is `resolveRunner` in `lib/jobs/types.ts`
and it fits on three lines:

```
private       → local   (forced; Auto, API, CLI and Demo all lose)
auto          → the default runner
anything else → that runner
```

No scoring, no classifier. **Auto** means the default runner:
`JOBS_DEFAULT_RUNNER` when it names a runner; else `demo` in demo mode; else
the first runner whose configuration is present (`api` → `local`); else
`demo`.

### The private rule

A card is **private** when its text carries a line `PRIVACY: local-only` (also
`PRIVATE: yes`) — the same tag persona entries use for things that never leave
your machine. The lock on the new-job sheet writes that line; the capture box
on the home page honours it too. A private card:

- is forced to the **Local** runner whatever the picker says,
- never reaches a cloud runner — the `api` and `cli` runners refuse it even
  if handed one directly,
- is **Blocked** with the reason `Local model is unreachable — job kept local,
  not sent to a cloud model` when no local server is configured
  (`LOCAL_LLM_BASE_URL`) or the server does not answer, before or during the
  run. Blocked cards count as "needs you"; **Unblock** puts them back in the
  inbox, **Try again** re-probes.

## The runners

| id | Label | Kind | Cost | Does | Needs |
|---|---|---|---|---|---|
| `api` | API | cloud | API credits | prompt → result through your key (Anthropic first, else OpenAI), persona-aware and privacy-routed like every other module | `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` |
| `cli` | CLI | cli | your CLI plan | hands the brief to an agent CLI on PATH — `codex exec` (workspace-write sandbox) or `claude -p` (edits auto-accepted) — working in `JOBS_CLI_CWD`; the final message is the output | `codex` or `claude` installed and signed in |
| `local` | Local | local | $0 | prompt → result on your OpenAI-compatible server; the persona goes in whole, local-only entries included | `LOCAL_LLM_BASE_URL` (+ `LOCAL_LLM_MODEL`) |
| `demo` | Demo | demo | $0 | a simulated run with a deterministic answer; no model, no network | nothing |

Health is passive: `api` and `local` check env names (and `local` one cached
`GET /models`, 60 s negative cache); `cli` runs `--version` once a minute;
`demo` is always ready. Nothing loads, starts or wakes anything.

Limits worth knowing: `api` and `local` are prompt-only (no tools, no file
edits); the CLI runner is agentic and runs detached from the request — a
server restart while it runs marks the card failed with that reason rather
than leaving it spinning; `JOBS_CLI_TIMEOUT_SEC` (default 1800) stops a runaway.

## Add a runner in one file

1. Add a manifest to `RUNNER_MANIFESTS` in `lib/jobs/types.ts`: id, label
   (≤ 12 chars), kind (`cloud` | `local` | `cli` | `demo`), cost model + hint,
   capabilities (`agentic` xor `promptOnly`), required env **names**,
   description, limits. `validateRegistry()` refuses duplicates, a paid local
   runner and an agentic-and-promptOnly entry; the registry test runs it.
2. Create `lib/jobs/runners/<id>.ts` exporting a `Runner` (`manifest`,
   `health(env)`, `start(job, env)`) and add it to `RUNNERS` in
   `lib/jobs/runners/index.ts` — the import-time check refuses a manifest
   without a file or vice versa.
3. Use `lib/providers` for the model (`providersFromEnv`,
   `completeWithContext`, `localProvider`) — do not add a second HTTP client.
4. The picker, the card chips and `GET /api/jobs` read the manifest; nothing
   else to wire. Keep the property the existing runners have: no other hosts,
   no shelling out unless that is the runner's whole point.

## How this sits on the provider router

`lib/providers/routing.ts` decides **which model** sees **which context**
(public / cloud-ok / local-only). The runner layer decides **who executes the
card**. They compose: the `api` runner calls `completeWithContext`, so a
cloud-ok persona goes with the brief and local-only entries are withheld
(or routed to the local server when one is configured); the `local` runner
calls `localProvider` directly with everything, because nothing leaves the
machine. The private rule is the only place the two overlap, and it is
stricter: a private card does not get "local-only entries withheld, the rest
sent" — it does not get sent at all.
