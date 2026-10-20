# JollyOS

A self-hosted, ADHD-first personal operations dashboard. One owner, no
database, pluggable modules, and a privacy rule for AI that is enforced in code:
anything you tag **local-only** is only ever sent to a model running on your
own machine, or not sent at all.

It ships with three modules: a **Jobs board** with a capture box and swappable
runners (your API, a CLI agent, a local model, or a demo — private cards never
leave the machine), a **Daily Brief** that folds your feeds into sections written for you,
and a **Persona** that answers questions the way you would and learns from a
swipeable **Decision Deck**. **Import your context** from ChatGPT, Claude,
Gemini, Notion, Obsidian or Apple Notes into a review queue — approve what is
true, and the Brief gets personal right away: ranked by your interests, feed
suggestions you accept one tap at a time, and a "why you're seeing this" line
on every story. Demo mode runs the whole thing on fictional data with no
configuration.

| Phone | Desktop |
|---|---|
| ![Home on a phone](docs/screenshots/phone-home.png) | ![Home on a desktop](docs/screenshots/desktop-home.png) |
| ![Jobs board on a phone](docs/screenshots/phone-jobs.png) | ![Jobs board on a desktop](docs/screenshots/desktop-jobs.png) |
| ![New job sheet with the runner picker on a phone](docs/screenshots/phone-jobs-new-job.png) | ![New job sheet with the runner picker on a desktop](docs/screenshots/desktop-jobs-new-job.png) |
| ![A private card forced to the Local runner on a phone](docs/screenshots/phone-jobs-runner.png) | ![A private card forced to the Local runner on a desktop](docs/screenshots/desktop-jobs-runner.png) |
| ![Daily Brief on a phone](docs/screenshots/phone-brief.png) | ![Daily Brief on a desktop](docs/screenshots/desktop-brief.png) |
| ![Ask Myself on a phone](docs/screenshots/phone-ask.png) | ![Ask Myself on a desktop](docs/screenshots/desktop-ask.png) |
| ![Decision Deck on a phone](docs/screenshots/phone-deck.png) | ![Decision Deck on a desktop](docs/screenshots/desktop-deck.png) |
| ![Import your context on a phone](docs/screenshots/phone-import.png) | ![Import your context on a desktop](docs/screenshots/desktop-import.png) |
| ![The review queue after the sample import on a phone](docs/screenshots/phone-import-review.png) | ![The review queue on a desktop](docs/screenshots/desktop-import-review.png) |
| ![The Brief before importing, on a phone](docs/screenshots/phone-brief-before.png) | ![The Brief after importing: ranked, explained, with feed suggestions](docs/screenshots/desktop-brief-after.png) |

## Quick start

**Docker** (demo mode, no `.env` needed):

```bash
docker compose up
# → http://127.0.0.1:3000
```

**npm** (Node 22+):

```bash
npm ci
DEMO_MODE=true npm run dev
# → http://localhost:3000
```

To run it for real, copy `.env.example` to `.env`, set `DEMO_MODE=false`, and
the first visit shows a one-time setup page where you create the owner
account. Data lives in `DATA_DIR` (`./data` locally, `/data` in Docker).

## Demo mode

`DEMO_MODE=true` signs every visitor in as **Alex Rivera**, a fictional
product designer, and seeds `DATA_DIR` from `demo/seed/*.json` on first start:
a persona with mixed privacy tags, three jobs, three fictional feeds and a few
deck answers. A banner on every page says the data is fictional. No network
calls are made: feeds come from fixtures and, unless you set a key, answers
come from a deterministic in-process demo provider.

## Configuration

Every variable is optional. See `.env.example` for the same list with comments.

| Variable | Default | What it does |
|---|---|---|
| `DEMO_MODE` | `false` (`true` in compose) | Fictional seeded data, auto-login, no setup page |
| `DATA_DIR` | `./data` | Where owner credentials, jobs, persona, decisions and the brief cache live |
| `AUTH_SECRET` | generated | Signs the session cookie; auto-generated into `DATA_DIR/auth-secret` when unset |
| `PORT` | `3000` | HTTP port |
| `LLM_PROVIDER` | auto | `anthropic` \| `openai` \| `local` \| `demo`; auto = first configured key, else demo |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | –, `claude-opus-5` | Anthropic via the official SDK |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | –, `gpt-5-mini` | OpenAI chat completions |
| `LOCAL_LLM_BASE_URL`, `LOCAL_LLM_MODEL` | – | Any OpenAI-compatible local server (LM Studio, Ollama, llama.cpp…). Also the **Local** job runner, the only one a private card may use |
| `JOBS_DEFAULT_RUNNER` | auto | What **Auto** means on the Jobs board: `api` \| `cli` \| `local` \| `demo`; auto = demo in demo mode, else the first configured |
| `JOBS_CLI`, `JOBS_CLI_CWD`, `JOBS_CLI_TIMEOUT_SEC` | auto, `DATA_DIR/cli-workspace`, `1800` | The **CLI** runner: which agent CLI to prefer (`codex` or `claude`), the folder it may edit, its time limit |
| `BRIEF_FEEDS` | – | Comma-separated RSS/Atom URLs for the Daily Brief (ignored in demo mode). Feeds you accept from the Brief's suggestions are added from `DATA_DIR/brief-feeds.json` |

## Providers and privacy routing

Every model call goes through one adapter (`lib/providers/`) with four
implementations: Anthropic, OpenAI, a local OpenAI-compatible server, and a
deterministic demo. Modules never pick a provider; they hand the router a
prompt built from **tagged context segments** (`public`, `cloud-ok`,
`local-only`) and the router applies one rule:

1. No local-only context → the default provider answers.
2. Local-only context **and** a local server is configured → the **local**
   server answers, with everything.
3. Local-only context and **no** local server → the local-only segments are
   dropped before anything is sent, and the UI tells you how many were
   withheld and why.

The demo provider is deliberately not counted as "local", so you can see the
rule work in demo mode. The rule is a pure function with unit tests
(`tests/providers-routing.test.ts`). Decision Deck answers to private cards are
stored in a separate file (`DATA_DIR/private/`) so a cloud-safe read cannot
pick them up by accident.

Imports follow the same rule twice over: extraction with a **local model**
tags the text local-only (so it can only reach the local provider), and
extraction in the **cloud** is refused by the server unless the request carries
an explicit per-batch opt-in. Interests derived from local-only entries may
rank Brief stories (keyword matching on your server) but are never written
into a cloud prompt (`tests/brief-personal.test.ts`).

## Modules

| Module | Route | What it does |
|---|---|---|
| Jobs | `/jobs` | Capture box → card in the inbox. One **Runner** control: **Auto** (the configured default), **API** (your key, persona-aware), **CLI** (`codex` or `claude` on this machine, agentic), **Local** (your OpenAI-compatible server, $0), **Demo** (no model). A **Private** card is forced to Local and never reaches a cloud model — with no local server it sits in **Blocked** with the reason. Filters: needs you, running, inbox, blocked, done, failed. See [docs/runners.md](docs/runners.md). |
| Daily Brief | `/brief` | One folded section per feed with a summary written for you, plus model-free sections for your jobs and decisions. Once you have approved imports, stories are ranked by your derived interests, avoid-topics are hidden behind a toggle, each matched story says why it is there, and a small catalog of public feeds is suggested — accepted one tap at a time, never auto-subscribed. Cached per day; refresh on demand. |
| Persona | `/persona`, `/persona/ask`, `/persona/deck`, `/persona/import` | Profile, values, preferences, rules and examples, each with a privacy tag. **Ask Myself** answers as you. The **Decision Deck** is twelve starter dilemmas you swipe; money and people cards are local-only by construction. **Import** reads a ChatGPT or Claude export, a Gemini Takeout, a Notion export, a notes folder or pasted text into a review queue; every candidate is local-only until you approve it. See [docs/importing-context.md](docs/importing-context.md). |

A module whose required configuration is missing shows a "needs setup" card
instead of crashing; modules can be switched off from `/settings`. Writing one
takes a manifest and one import: see [docs/modules.md](docs/modules.md).

## Docs

- [docs/architecture.md](docs/architecture.md) — request flow, state files, auth, routing, runners, imports
- [docs/importing-context.md](docs/importing-context.md) — export steps per platform (cited), what the importers read, how the Brief uses it
- [docs/runners.md](docs/runners.md) — the job runners: one picker, one rule (Auto / private → local only), add a runner in one file
- [docs/modules.md](docs/modules.md) — how to write a module
- [docs/design-system.md](docs/design-system.md) — the ADHD-first rules and the primitives
- [CONTRIBUTING.md](CONTRIBUTING.md) — checks to run, ground rules

## Development

```bash
npm run dev          # dev server
npx tsc --noEmit     # types
npm run lint         # eslint
npm test             # vitest
npm run build        # production build (standalone output)
npm run scrub:history   # scrub-check over the working tree and every commit
```

CI (`.github/workflows/ci.yml`) runs all of the above plus gitleaks over the
full history.

## License

MIT — see [LICENSE](LICENSE). License: MIT (assumption — confirm before publishing).
