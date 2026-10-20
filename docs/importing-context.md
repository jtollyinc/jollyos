# Importing your context

JollyOS can read what other tools already know about you — your ChatGPT or
Claude history, what they "remember", your custom instructions, your Notion
pages, an Obsidian vault, Apple Notes — and turn it into **candidate persona
items** you approve one by one. Nothing enters your persona until you say so.

In the app: **Persona → Import** (`/persona/import`), also linked from Settings.

> **Last checked: 2026-10-20** — UIs change. If a step below differs from what
> you see, follow the linked official page; it wins.

## Why import? Your Brief gets personal right away

The point of importing is not a fuller profile page. It is that the **Daily
Brief** starts reading like it was written for you the same day:

- **Interests and avoid-topics** are derived from your persona the moment you
  approve imported items (deterministic: a small topic catalog plus explicit
  "I'm into…" phrases; `lib/persona/interests.ts`). Each derived interest keeps
  the privacy tag of the entries it came from and remembers where they came
  from ("your ChatGPT import").
- **Feed suggestions**: a small curated catalog of public RSS feeds
  (`lib/brief/feed-catalog.json`, every URL verified to resolve on 2026-10-20)
  is matched against your interests. Suggestions are shown with a one-tap
  **Accept**. Nothing is ever subscribed for you.
- **Ranking and filtering**: stories that match your interests are boosted;
  stories on an avoid-topic are hidden behind a "show hidden" toggle.
- **Summaries in your voice**: the summariser gets your persona and your
  interests as tagged context, and is told to follow your stated tone and
  length preferences.
- **"Why you're seeing this"**: every matched story carries a line such as
  *matches: design systems, accessibility · from your ChatGPT import*.

**The privacy rule.** Ranking is plain keyword matching on your own server, so
a local-only interest *may* rank stories. It is **never** written into a prompt
for a cloud model: interests become tagged context segments and the existing
router withholds the local-only ones when only a cloud provider is available
(or sends everything to your local model when you have one). The story-list
annotations in the prompt only ever name cloud-safe interests. This is enforced
in `lib/brief/build.ts` and proven by `tests/brief-personal.test.ts`.

## How it works, in one screen

1. **Pick a source** — tile per platform.
2. **Add it** — upload the export (zip or file), paste text, or point at a
   folder inside `DATA_DIR`. The "How to export" steps are folded under the
   source; this page has the same steps with citations.
3. **Choose how to find items**:
   - **Rules** (always available, nothing leaves the machine): deterministic
     patterns — "I prefer…", "always/never…", "my rule…", "I'm a…", "I decided…",
     "I'm into…", "don't show me … news", memory bullets, custom-instruction
     lines. Requests to an assistant and questions are dropped.
   - **Local model**: your OpenAI-compatible server (`LOCAL_LLM_BASE_URL`).
     The text is tagged local-only, so the router can only hand it to the
     local provider. Without one, this option is refused (HTTP 409) and you
     are offered Rules or the cloud opt-in.
   - **Cloud**: the default hosted provider, **only** with an explicit per-batch
     opt-in. The warning names the provider and model and says what will be
     sent. Without the opt-in the server refuses (HTTP 403) before reading a
     byte. The items found are still saved local-only.
4. **Review the queue** — approve, reject or edit each candidate; change its
   category (preference, rule, fact, value, decision pattern, interest, avoid
   topic) or its privacy tag. Bulk buttons: approve all, approve the confident
   ones, reject the rest. Every candidate is born **local-only**.
5. Approved items become persona entries with their source attached; the
   interest profile is re-derived and the Brief rebuilds on its next load.

**Raw files.** Uploads are kept under `DATA_DIR/imports/raw/<batch>/` so you
can re-run extraction; `DATA_DIR` is git-ignored. The **Delete raw files**
button removes them and keeps the queue and your persona. Folder imports are
read in place and never copied.

**Demo mode.** "Try with sample data" runs four fictional sample batches for the
demo user Alex Rivera (`demo/samples/`): a ChatGPT `conversations.json`, a
Claude `conversations.json`, three Markdown notes and a pasted memory dump.

## ChatGPT

**Data export** (official: [Exporting your ChatGPT history and data](https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data)):

1. Sign in to ChatGPT → open your profile menu → **Settings** → **Data controls**.
2. Under **Export data**, select **Export**, then **Confirm export**.
3. ChatGPT emails (or texts) you when the export is ready — "up to 7 days". The
   download link expires 24 hours after you receive it.

The zip contains `conversations.json` (larger exports may contain numbered
conversation JSON files instead — [source](https://help.openai.com/en/articles/9106926-transfer-exported-conversations-between-chatgpt-accounts)).
Upload the whole zip or just `conversations.json`.

**Memory** (official: [Memory in ChatGPT](https://help.openai.com/en/articles/8590148-memory-faq)):
**Settings → Personalization → Memory**; depending on your account the
controls include *Memory summary*, *Manage* or *Saved memories*. OpenAI does
not document a copy or export of memories, so: open the list, select all, copy,
and paste it into the Import page's paste box. Alternatively ask in a chat —
*"List everything you remember about me, verbatim, as a bullet list"* — and
paste the answer (that prompt is ours, not an official feature).

**Custom instructions** (official: [Custom instructions](https://help.openai.com/en/articles/8096356-custom-instructions-for-chatgpt)):
Web and desktop: **Settings → Personalization**, with *Enable customization* on.
iOS and Android: **Settings → Customize ChatGPT**. Copy both text boxes and
paste them; a heading line like `Custom instructions` above them tells the
extractor to trust every line.

**What JollyOS reads.** The `mapping` tree in `conversations.json` (edits and
regenerations fork it); JollyOS follows the active branch (`current_node` back
to the root, else the last child at every fork) and mines **only your own
messages** (`author.role == "user"`). Hidden system messages are skipped.
Unknown fields are ignored. OpenAI does not publish this structure; it is
observed from exports.

## Claude

**Data export** (official: [Export your Claude data](https://support.claude.com/en/articles/9450526-export-your-claude-data)):

1. On claude.ai go to **Settings → Privacy** and click **Export data**.
2. The export is emailed to your account address; the link expires 24 hours
   after delivery. Exports cannot be started from the iOS or Android apps.
   On Team/Enterprise plans an owner must allow member exports first.

**Memory** (official: [Import and export your memory](https://support.claude.com/en/articles/12123587-import-and-export-your-memory-from-claude)
and [Chat search and memory](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context)):
**Settings → Memory** lists everything under *Topics*; or **Settings →
Capabilities → View and edit your memory**; or ask Claude — the official
page suggests *"Write out your memories of me verbatim, exactly as they appear
in your memory."* Copy the result and paste it into the paste box.

**Project instructions** (official: [Create and manage projects](https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects)):
open a project → **Set project instructions** → copy the text. Account-wide
instructions live under your initials → **Settings → Instructions for Claude**
([personalization features](https://support.claude.com/en/articles/10185728-understanding-claude-s-personalization-features)).

**What JollyOS reads.** `conversations.json` — an array of conversations with
`chat_messages`, each with `sender` (`human` / `assistant`) and `text` (or a
`content` array of text blocks); only **human** turns are mined. `projects.json`
— each project's `prompt_template` is mined as your instructions. Anthropic
does not document file names or shape; this is what exports look like, and
unknown fields are ignored. If your export differs, paste instead.

## Gemini

Official: [Download your Gemini Apps data](https://support.google.com/gemini/answer/16920332)
(and [How to download your Google data](https://support.google.com/accounts/answer/3024190)).

1. Go to **takeout.google.com** → under *Select data to include*, **Deselect all**.
2. For your chats: check **My Activity** → *All activity data included* →
   **Deselect all** → check **Gemini Apps** → **OK**. (The **Gemini** checkbox
   covers Gems, not chats.)
3. **Next step** → choose **.zip** → **Create export**. Google emails a link.

**What JollyOS reads.** The *My Activity* JSON for Gemini Apps: rows whose
`title` starts with **"Prompted …"** are what you typed. The official page does
not state whether the archive holds JSON or HTML (Takeout lets you choose); the
row shape is assumed from Takeout archives. If you got HTML, open it, copy your
prompts and paste them.

## Notion

Official: [Export your content](https://www.notion.com/help/export-your-content).

- One page (and its subpages): **•••** at the top right → **Export** → choose
  **Markdown & CSV** → switch on **Include subpages** → **Export** (a zip
  downloads).
- Whole workspace: **Settings → General → Export all workspace content**;
  Notion emails a download link (valid for 7 days).

**What JollyOS reads.** Every `.md` in the zip, paragraph by paragraph and list
item by list item, with a pointer back to *file › heading › line*. CSV files
(full-page databases) are table data and are skipped.

## Obsidian and Markdown folders

Official: [How Obsidian stores data](https://obsidian.md/help/data-storage) —
"Obsidian stores your notes as Markdown-formatted plain text files in a vault",
a folder on your file system. There is nothing to export.

Upload the `.md`/`.txt` files (or a zip of the folder), or copy the vault into
`DATA_DIR` and give the Import page its relative path. Only paths inside
`DATA_DIR` are read; files there are not copied. Front matter, code fences and
tables are skipped.

## Apple Notes

Official: [Import, export and print notes on Mac](https://support.apple.com/guide/notes/import-export-and-print-notes-not201900c07/mac).

- On a Mac: select a note → **File → Export To** → **Markdown** (or PDF). One
  note at a time; Apple documents no bulk note export in the app.
- Anything else: select the note's text, copy, paste into the paste box.
- Bulk, via Apple's Data & Privacy page ([Get a copy of your Apple Account data](https://support.apple.com/en-us/102208)):
  sign in → **Request a copy of your data** → include Notes. Apple says the
  copy includes notes synced to your Apple account but does not state the file format,
  and data protected with end-to-end encryption cannot be provided
  ([details](https://support.apple.com/en-us/102630)). If it arrives as
  Markdown or text, upload it; otherwise paste.

## Google Calendar and Gmail (optional — large and sensitive)

Calendar and mail are the most sensitive exports and the least useful for a
persona (they say what happened, not what you prefer). JollyOS has **no
importer for them**; this section is here so you can judge for yourself.

- **Google Calendar**: [Export your calendar](https://support.google.com/calendar/answer/37111) —
  **Settings → Import & export → Export** downloads a zip of `.ics` files; or
  via Takeout in iCalendar format ([details](https://support.google.com/calendar/answer/10041132)).
- **Gmail**: [Download your Gmail data](https://support.google.com/mail/answer/10016932)
  via Takeout; labels are preserved in a special header. Mailbox archives are
  large and contain other people's words — if you want rules from your own
  mail, copy a few of *your* sent messages into the paste box instead.

If you do want to mine these later, both are text; the paste box works.

## What could not be confirmed (2026-10-20)

- The `conversations.json` structures for ChatGPT (mapping tree) and Claude
  (`chat_messages`), and Claude's `projects.json`, are **observed**, not
  documented by the vendors. The parsers tolerate unknown fields and report
  what they skipped.
- Google does not state whether the Gemini Apps activity export is JSON or
  HTML, nor its row shape; the Gemini importer assumes the common *My Activity*
  JSON (`title: "Prompted …"`).
- OpenAI does not document a copy/export of Memory or whether memories are in
  the data export; the copy-paste route above is a workaround.
- Apple does not state the file format of notes in a Data & Privacy copy.
- Whether Gmail's Takeout archive is MBOX is not stated on the help page
  linked above (only in unrelated Vault docs); the section does not depend on it.

## For developers

- Parsers (pure): `lib/import/parsers/{chatgpt,claude,gemini,markdown,paste}.ts`,
  the zip reader `lib/import/zip.ts`, the dispatcher `lib/import/parse.ts`.
- Rule-based extractor: `lib/import/extract.ts` (`PATTERNS`, first match wins).
- Modes and the gate: `lib/import/modes.ts` (`authorizeExtraction`), run end to
  end by `lib/import/run.ts`; API routes under `app/api/import/`.
- Queue and raw files: `lib/import/queue.ts` (`DATA_DIR/imports/`).
- Interests, ranking, why-lines, suggestions: `lib/persona/interests.ts`;
  profile on disk: `lib/persona/interests-store.ts` (`DATA_DIR/interests.json`).
- Accepted feeds: `lib/brief/feeds-store.ts` (`DATA_DIR/brief-feeds.json`).
- Tests: `tests/import-*.test.ts`, `tests/interests.test.ts`, `tests/brief-personal.test.ts`.
