# First run — the welcome walkthrough

A brand-new JollyOS knows nothing about you, and a dashboard with nothing on it
is indistinguishable from a broken one. So the moment the setup page creates the
owner, you land on `/welcome`: seven short screens that leave you with a JollyOS
that is actually configured, and an idea of what each part is for.

It is skippable on every screen, resumable on any device, and re-runnable from
Settings. Nothing it does is permanent.

## The seven screens

| # | Screen | What it asks | What it writes |
|---|---|---|---|
| 1 | What JollyOS is | nothing — three cards: Jobs, Daily Brief, You | nothing |
| 2 | About you | what to call you, what you do, what you are working on | three `profile` entries in `persona.json`, `cloud-ok` |
| 3 | What you follow | 18 topic chips in two groups, plus free text | one `preference` entry per chip ("I follow accessibility."), one for the free text, and up to six feeds in `brief-feeds.json` |
| 4 | How you like information | brief length, tone, when your morning starts | three `preference` entries the Brief's summariser is told to obey |
| 5 | What stays on this machine | money, health, family, location (all on by default) | one `local-only` **rule** entry per protected category |
| 6 | The AI brain | none / a model on this machine / a hosted key, with a **Test** button | `ai-settings.json`, mode 600 |
| 7 | You are set up | nothing — a receipt of the above | marks the walkthrough done |

Every answer is written after each Back and Next, so closing the tab loses
nothing and another device picks up where you stopped.

## Why answers become persona entries

Because that is the only mechanism there is. `lib/persona/interests.ts` derives
your interest profile from the TEXT of your persona entries, and the Daily Brief
ranks stories against that profile. An imported ChatGPT export goes through
exactly the same path. The walkthrough gets no private door into the Brief: it
writes sentences, and the same deriver reads them.

A consequence worth knowing: a topic chip whose label matches none of its
topic's keywords would be a silent no-op. There is a test that refuses to let
that ship (`tests/walkthrough.test.ts`).

## Privacy: what "local only" actually does

Protecting a category on screen 5 does two things.

1. It writes a rule into your persona tagged `local-only` — "Anything about my
   money … stays on this machine."
2. It tags the matching interest `local-only` too, so **Personal finance** picked
   on screen 3 becomes a local-only interest.

`local-only` is enforced by the provider router (README, "Providers and privacy
routing"): a hosted model never receives it. With no local model configured it
is simply not sent, not quietly downgraded.

## Running it again

Settings → First run → **Run the walkthrough again** (`/welcome?replay=1`).

A re-run is a REPLACE, not an append: the ids of the persona entries and the
URLs of the feeds the last run created are remembered in `walkthrough.json`, and
the next completion removes those first. Anything you wrote by hand, imported or
swiped is never touched.

## Feeds

Screen 3 subscribes you to feeds from `lib/brief/feed-catalog.json`, at most two
per topic and six in total — the Brief reads six sources. Every URL in that
catalog answered HTTP 200 with a parseable RSS or Atom body when it was added,
fetched with the same User-Agent `lib/brief/rss.ts` sends.

After that the list is yours: **Daily Brief → Your feeds** adds any RSS or Atom
URL, mutes one without losing it, or removes it. `BRIEF_FEEDS` from the
environment is *added to* that list and is read-only in the UI, because it
belongs to whoever runs the server.

## The AI brain, and who wins

Screen 6 writes `DATA_DIR/ai-settings.json` with mode `600`. The API never
answers with a key — only `apiKeySet` and a four-character hint.

**The environment always wins.** `runtimeEnv()` (`lib/settings/ai.ts`) starts
from `process.env` and fills in only the variables that are unset or empty, so
an operator's `.env` or `docker-compose.yml` stays authoritative and nothing the
UI writes can silently override it. Settings says when both are present.

**Test** is a real request from this server to the cheapest endpoint the target
offers (a model list, free everywhere). A local server is tried at `/models`,
`/v1/models` and `/api/tags`, because LM Studio and Ollama disagree. The result
is one plain sentence, never a stack trace and never the key.

## Getting started checklist

Once the walkthrough is finished or skipped, Home shows a short checklist:
read your Brief, capture a job, swipe five Decision Deck cards, import your
context. Every row is derived from real state (`lib/onboarding/checklist.ts`) —
there is no stored "I did this" flag, so it cannot rot or lie. It is
dismissible, and that is reversible from Settings.

## Demo mode

`DEMO_MODE=true` shows the whole walkthrough (it is worth recording) and
`/welcome?replay=1` restarts it. A key typed on screen 6 is tested and then
thrown away: demo mode never persists a secret.

## Where the code is

| Piece | File |
|---|---|
| The screens, in order | `lib/onboarding/steps.ts` |
| The topic chips and the sensitive categories | `lib/onboarding/topics.ts` |
| Answers → persona entries and feeds (pure) | `lib/onboarding/seed.ts` |
| Progress, completion, re-run | `lib/onboarding/store.ts` |
| The Home checklist (pure) | `lib/onboarding/checklist.ts` |
| The model choice and `runtimeEnv()` | `lib/settings/ai.ts` |
| The Test button's checks | `lib/settings/reach.ts` |
| UI | `components/modules/Welcome/`, `app/(app)/welcome/` |
| API | `app/api/welcome/` |
| Tests | `tests/walkthrough.test.ts`, `tests/ai-settings.test.ts` |
