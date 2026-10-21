# Changelog

Notable changes per release. The section matching a `v*` tag is published as
that release's notes (`.github/workflows/release.yml`).

## 0.2.0 — 2026-10-21

**You no longer land in an empty app, and the app knows what you are for.**

### Goals & Coach — the spine

A new tool, and the thing the rest now hangs off. A goal is not a wish here: it
records what you want, where you honestly are today, what usually stops you,
and the hours a week you can really give it. A two-minute weekly check-in
records the same shape again.

The Coach then does the part people cannot do for themselves — it holds the two
next to each other and says the number out loud. Missed weeks, hours claimed
against hours actually spent, whether the number moved, jobs you finished
against it. Kind, blunt, no flattery, and exactly one adjustment: shrink it,
change the plan, or drop it.

It needs no AI. The verdict is arithmetic; a model, if you have one, only
rewrites the wording. A goal about your health, money or family is local-only
and never goes to a hosted model at all.

Goals show up everywhere else too: today's one step on Home, "For your goal: …"
on Brief stories that relate to one, and jobs you can link so that finishing
them counts as evidence.

### A welcome walkthrough that actually configures JollyOS

Creating your account now leads straight into eight short screens: what JollyOS
is, what to call you, what you follow, how you like information, what must stay
on your machine, an optional model, and a receipt. Skip any screen; your place
is saved in your data folder, so another device picks up where you stopped, and
Settings can run the whole thing again.

Your answers become real configuration, not a tour flag — persona entries,
subscribed feeds, and privacy rules the model router enforces. Running it again
replaces what the last run created and leaves anything you wrote by hand alone.

See [docs/first-run.md](docs/first-run.md).

### Nothing needs a text editor any more

- **Feeds** are edited in the Daily Brief: add any RSS or Atom URL, mute one
  without losing it, remove it. The Brief no longer demands `BRIEF_FEEDS` and
  no longer shows "needs setup" without it. `BRIEF_FEEDS` still works and is
  added on top.
- **A model** can be set from the walkthrough: none at all, one running on your
  machine, or a hosted key. **Test** makes a real request and tells you plainly
  what happened. Keys are stored with mode 600 and are never sent back to the
  browser. An operator's `.env` still wins over anything chosen in the app.
- The feed catalog grew from 23 to 37 public feeds, so every topic you can tap
  has a working source.

### Every page says what it is for

A plain one-line description under every page title and a (?) that answers
three questions: what it does, one example, how to start. Empty states explain
themselves and offer one next action instead of a blank column.

### A Getting started checklist

After the walkthrough, Home shows a short list — read your Brief, capture a
job, swipe five Decision Deck cards, import your context. Every row is derived
from what has actually happened, so it cannot rot or lie, and it is dismissible.

### Fixed

- "I follow personal finance" derived no interest at all: the topic's own label
  was not one of its keywords.
- A failed local-model test always said "the connection failed", because Node
  hides the real reason inside the error's cause. It now says things like
  "nothing is listening there".

## 0.1.0 — 2026-10-20

First public release: the one-click zips for Windows, macOS (Apple silicon and
Intel) and Linux, each with a bundled, checksum-verified Node 22 runtime.

Jobs board with swappable runners, the Daily Brief, the Persona with Ask Myself
and the Decision Deck, importing your context from ChatGPT / Claude / Gemini /
Notion / notes, privacy-routed AI providers, single-owner auth, demo mode.
