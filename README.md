# JollyOS

**Your self-hosted personal OS: AI jobs, a Daily Brief that knows you, and private data that never leaves your machine.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node >=22](https://img.shields.io/badge/node-%3E%3D22-339933.svg?logo=node.js&logoColor=white)](package.json)
[![CI](../../actions/workflows/ci.yml/badge.svg)](../../actions/workflows/ci.yml)

## Download

### **[Download JollyOS for your computer](../../releases/latest)**

Nothing to install: no Node, no terminal, no Docker. Four steps.

1. **Download the file for your computer** from the page above:

   | Your computer | The file |
   |---|---|
   | Windows | `jollyos-…-windows-x64.zip` |
   | Mac with Apple silicon (M1 or newer) | `jollyos-…-macos-arm64.zip` |
   | Mac with an Intel chip | `jollyos-…-macos-x64.zip` |
   | Linux (x86-64) | `jollyos-…-linux-x64.zip` |

   Which Mac do you have? Apple menu → **About This Mac**: "Chip: Apple M…" is
   Apple silicon, "Processor: Intel…" is Intel.

2. **Unzip it.** Windows: right-click the downloaded file → **Extract All**
   (JollyOS will not run from inside the zip). Mac: double-click it. Linux:
   right-click → **Extract Here**.
3. **Double-click `Start JollyOS`** in the unzipped folder — on Linux,
   `start-jollyos.sh`. A window opens and says JollyOS is running, and your
   browser opens at `http://127.0.0.1:3000`.
4. **Pick a username and a password.** That is your account. There is no
   default login and nothing is sent anywhere.

Your computer warns you once, because the download is new and not signed by a
big company:

- **Windows** — "Windows protected your PC": click **More info**, then **Run
  anyway**.
- **macOS** — "cannot verify the developer": **right-click** (or Control-click)
  **Start JollyOS → Open**, then **Open** in the box. On macOS 15 (Sequoia) and
  newer that box may only offer Done, so open **System Settings → Privacy &
  Security**, scroll to Security, click **Open Anyway** next to Start JollyOS,
  and start it again.
- **Linux** — if the launcher will not run, allow it to:
  `chmod +x start-jollyos.sh runtime/bin/node`.

Keep that window open while you use JollyOS; closing it (or pressing Ctrl+C in
it) stops JollyOS. Everything you save lives in the **`data` folder next to the
app** — copy it into a newer version to keep your account and your data.
JollyOS listens on `127.0.0.1` only, so nothing on your network can reach it.
Each zip carries the official [Node.js](https://nodejs.org) 22 runtime for your
system, so nothing is installed: delete the folder and JollyOS is gone.

Prefer Docker, or want to run it from source? See
[For developers](#for-developers).

One owner, no database, pluggable modules, and a privacy rule for AI that is
enforced in code: anything you tag **local-only** is only ever sent to a model
running on your own machine, or not sent at all.

- **Jobs board**: a capture box and swappable runners (your API, a CLI agent, a
  local model, or a demo). Private cards never leave the machine.
- **Daily Brief**: your feeds folded into sections written for you, ranked by
  your interests, with a "why you're seeing this" line on every story.
- **Persona**: answers questions the way you would and learns from a swipeable
  **Decision Deck**.
- **Import your context** from ChatGPT, Claude, Gemini, Notion, Obsidian or
  Apple Notes into a review queue. Approve what is true and the Brief gets
  personal right away.

![The Daily Brief after importing: ranked, explained, with feed suggestions](docs/screenshots/desktop-brief-after.png)

| Phone | Desktop |
|---|---|
| ![Jobs board on a phone](docs/screenshots/phone-jobs.png) | ![Jobs board on a desktop](docs/screenshots/desktop-jobs.png) |
| ![The Brief after importing, on a phone](docs/screenshots/phone-brief-after.png) | ![Feed suggestions in the Brief after importing, on a desktop](docs/screenshots/desktop-brief-feeds.png) |
| ![Decision Deck on a phone](docs/screenshots/phone-deck.png) | ![Decision Deck on a desktop](docs/screenshots/desktop-deck.png) |

<details>
<summary><b>More screenshots</b></summary>

| Phone | Desktop |
|---|---|
| ![Home on a phone](docs/screenshots/phone-home.png) | ![Home on a desktop](docs/screenshots/desktop-home.png) |
| ![New job sheet with the runner picker on a phone](docs/screenshots/phone-jobs-new-job.png) | ![New job sheet with the runner picker on a desktop](docs/screenshots/desktop-jobs-new-job.png) |
| ![A private card forced to the Local runner on a phone](docs/screenshots/phone-jobs-runner.png) | ![A private card forced to the Local runner on a desktop](docs/screenshots/desktop-jobs-runner.png) |
| ![Daily Brief on a phone](docs/screenshots/phone-brief.png) | ![Daily Brief on a desktop](docs/screenshots/desktop-brief.png) |
| ![Ask Myself on a phone](docs/screenshots/phone-ask.png) | ![Ask Myself on a desktop](docs/screenshots/desktop-ask.png) |
| ![Import your context on a phone](docs/screenshots/phone-import.png) | ![Import your context on a desktop](docs/screenshots/desktop-import.png) |
| ![The review queue after the sample import on a phone](docs/screenshots/phone-import-review.png) | ![The review queue on a desktop](docs/screenshots/desktop-import-review.png) |
| ![The Brief before importing, on a phone](docs/screenshots/phone-brief-before.png) | ![The Brief before importing, on a desktop](docs/screenshots/desktop-brief-before.png) |
| ![First-run setup on a phone](docs/screenshots/phone-setup.png) | ![First-run setup with the live password rules on a desktop](docs/screenshots/desktop-setup-rules.png) |
| ![Settings → Password on a phone](docs/screenshots/phone-change-password.png) | ![Password changed, every other device signed out, on a desktop](docs/screenshots/desktop-change-password-success.png) |

</details>

## For developers

Everything below is for running JollyOS from source. If you only want to use
it, the [Download](#download) above needs none of it.

**npm** — install **Node 22 or newer first**; it is not on a fresh Windows or
Mac. Windows: `winget install OpenJS.NodeJS.LTS`, or the LTS installer from
[nodejs.org](https://nodejs.org). Mac: `brew install node@22` or the same
installer. Then **open a new terminal** so `node` and `npm` are on your PATH
(otherwise `npm ci` answers "npm is not recognized"). In Windows `cmd` or
PowerShell, `npm.cmd ci` works when script execution is disabled.

```bash
npm ci
npm run dev
# → http://localhost:3000
```

The first visit shows a one-time **setup page**: choose a username and a
password (12+ characters, not a common one, not containing the username) and
you are in. That is the only account there is; JollyOS ships with **no default
login** and nothing can sign in before setup. Data lives in `DATA_DIR`
(`./data` locally, `/data` in Docker). Copy `.env.example` to `.env` when you
want to configure a model provider or feeds.

Two things to know about that first run:

- **`npm run dev` listens on every interface**, so anyone on your network can
  reach it. For a machine you share, bind it to yourself:
  `npm run dev -- -H 127.0.0.1` (same for `npm start`).
- **The Daily Brief says "needs setup" until you give it feeds.** It has no
  default list — set `BRIEF_FEEDS` in `.env` to a comma-separated list of
  RSS/Atom URLs and restart, or run `DEMO_MODE=true npm run dev` to see the
  module on fixtures. Jobs, Persona, Ask Myself, the Decision Deck and Import
  all work with no configuration at all.

**Demo mode** (fictional data, no account):

```bash
DEMO_MODE=true npm run dev
```

**Docker** (demo mode by default, no `.env` needed):

```bash
docker compose up
# → http://127.0.0.1:3000
```

For the real thing in Docker, `DEMO_MODE=false docker compose up` (or put it
in `.env`): the first visit shows the setup page, and `/data` is a named
volume that keeps the owner account.

## Demo mode

`DEMO_MODE=true` signs every visitor in as **Alex Rivera**, a fictional
product designer, and seeds `DATA_DIR` from `demo/seed/*.json` on first start:
a persona with mixed privacy tags, three jobs, three fictional feeds and a few
deck answers. A banner on every page says the data is fictional. No network
calls are made: feeds come from fixtures and, unless you set a key, answers
come from a deterministic in-process demo provider.

Demo mode is **explicit only**: it is on when `DEMO_MODE` is exactly `true`
(or `1`, `yes`, `on`) and off for anything else, including unset. A missing
owner or a missing `.env` never turns it on; the real app lands on setup
instead. Never expose a demo instance to the internet: there is no password.

## Owner account and passwords

- **Setup is single-use.** Once the owner exists, `/setup` redirects to
  `/login` and `POST /api/auth/setup` answers `409`, so nobody can take over
  an instance by finding that page later.
- **Change your password** at Settings → **Change password** (current
  password, new one twice, the rules shown live). Every other browser and
  device is signed out at once; the one you used stays signed in.
- **Locked out?** Reset it from a shell on the machine:

  ```bash
  npm run reset-owner                  # prompts for the new password, twice
  npm run reset-owner -- --stdin       # reads it from the first line of stdin
  npm run reset-owner -- --remove      # deletes the owner; the next visit shows setup again
  npm run reset-owner -- --remove --yes   # ...without the confirmation prompt
  npm run reset-owner -- --help
  ```

  In Docker:

  ```bash
  docker compose exec -it jollyos npm run reset-owner
  printf '%s\n' 'a new long password' | docker compose exec -T jollyos npm run reset-owner -- --stdin
  docker compose exec -it jollyos npm run reset-owner -- --remove
  ```

  The reset applies the same rules as setup and signs every session out.
- Passwords are stored as scrypt hashes in `DATA_DIR/owner.json` (mode 600);
  sessions are signed cookies with `AUTH_SECRET`, which is generated into
  `DATA_DIR/auth-secret` (mode 600) when you do not set it. Details, rate
  limits and the threat model: [docs/security.md](docs/security.md).

## Configuration

Every variable is optional. See `.env.example` for the same list with comments.

| Variable | Default | What it does |
|---|---|---|
| `DEMO_MODE` | `false` (`true` in compose) | Exactly `true` = fictional seeded data, auto-login as the demo user, no account. Anything else = the real app with first-run setup |
| `DATA_DIR` | `./data` | Where the owner account (`owner.json`, scrypt hash), jobs, persona, decisions and the brief cache live |
| `AUTH_SECRET` | generated | Signs the session cookie (HS256). Auto-generated into `DATA_DIR/auth-secret` (mode 600) when unset; set it when you run more than one replica |
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
- [docs/security.md](docs/security.md) — how auth works, where the hash lives, rate limits, the reset CLI, what is out of scope
- [docs/importing-context.md](docs/importing-context.md) — export steps per platform (cited), what the importers read, how the Brief uses it
- [docs/runners.md](docs/runners.md) — the job runners: one picker, one rule (Auto / private → local only), add a runner in one file
- [docs/modules.md](docs/modules.md) — how to write a module
- [docs/design-system.md](docs/design-system.md) — the ADHD-first rules and the primitives
- [docs/releases.md](docs/releases.md) — how the one-click zips are built, and how to cut a release
- [CONTRIBUTING.md](CONTRIBUTING.md) — checks to run, ground rules

## Development

```bash
npm run dev          # dev server (add `-- -H 127.0.0.1` to keep it off the network)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm test             # vitest
npm run build        # production build (standalone output)
npm run scrub:history   # scrub-check over the working tree and every commit
npm run reset-owner     # reset (or --remove) the owner account from a shell

scripts/package-release.sh linux-x64    # one ready-to-run zip (any target, from Linux)
```

`scripts/package-release.sh <windows-x64|macos-arm64|macos-x64|linux-x64>`
builds the download above: the standalone build plus a checksum-verified
official Node 22 runtime, zipped with the double-click launchers. Pushing a
`v*` tag runs `.github/workflows/release.yml`, which builds all four, smoke
tests each on its own OS and publishes the release. See
[docs/releases.md](docs/releases.md).

CI (`.github/workflows/ci.yml`) runs all of the above plus gitleaks over the
full history.

## License

MIT — see [LICENSE](LICENSE).
