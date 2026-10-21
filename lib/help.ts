/**
 * lib/help — the "what is this?" text behind the (?) on every page.
 * ────────────────────────────────────────────────────────────────────────────
 * Client-safe plain data. One entry per page; each has the one line that sits
 * under the title AND three short answers for the dialog: what it does, one
 * concrete example, how to start. No page should explain itself in prose
 * somewhere else — if a visitor could ask "what is this for?", the answer
 * belongs here (components/jolly/HelpButton renders it).
 */

export interface HelpTopic {
  /** The dialog's heading. Usually the page name. */
  title: string;
  /** The one plain line under the page title. Shown even when the dialog is closed. */
  line: string;
  /** What it does, in two sentences at most. */
  what: string;
  /** One concrete thing somebody actually did with it. */
  example: string;
  /** The first move. */
  start: string;
}

export const HELP: Record<string, HelpTopic> = {
  home: {
    title: "Home",
    line: "One place for what needs you now: capture a job, then open whichever tool is loudest.",
    what: "Home shows the one thing that needs you, a box to capture a thought, and a tile per tool with its real state. Nothing here is a to-do list you have to groom.",
    example: "You think of something on the stairs, type it into the capture box, and it is a job card before you sit down.",
    start: "Type anything into the capture box. The first line becomes the title.",
  },
  goals: {
    title: "Goals & Coach",
    line: "What you are actually working towards, how far along you really are, and the one thing to change this week.",
    what: "A goal records what you want, where you honestly are today and the hours you can really give it. A weekly check-in records the same shape again, and the Coach reads the gap between the two. The verdict is arithmetic, not an opinion — it works with no AI at all.",
    example: "\"You planned 5h a week and have been spending 1h. That is 5× less than the plan, every week, for 6 weeks.\" — then one adjustment: shrink it to 1h.",
    start: "Set one goal. One is better than three, and the first check-in is where it starts being useful.",
  },
  jobs: {
    title: "Jobs",
    line: "Capture a thought as a card, then pick who does the work: a hosted model, a CLI agent, or a model on this machine.",
    what: "A job is a card with a lane (inbox, running, done, blocked). The Runner control decides who does it. A card marked Private is forced to a model on this machine and never reaches a hosted one.",
    example: "\"Draft a reply to the landlord about the broken dryer\" → Private → runs on the local model → the draft lands on the card.",
    start: "Tap New job, type one line, leave the Runner on Auto.",
  },
  brief: {
    title: "Daily Brief",
    line: "Your feeds, read for you and folded away: one section per source, summarised for what you care about.",
    what: "The Brief fetches the feeds you picked, ranks every story against your interests, and writes a short summary per source. Your jobs and your decisions get sections too, and those need no model at all.",
    example: "Three accessibility posts float to the top with \"matches: accessibility\" under them; the crypto story sits behind \"show hidden\" because you said to skip it.",
    start: "Open Your feeds below and add one, or tap a suggestion. Then hit Refresh.",
  },
  feeds: {
    title: "Your feeds",
    line: "The sources the Brief reads. Add any RSS or Atom URL; switch one off without losing it.",
    what: "Every feed you accept or paste is stored on this machine and fetched when the Brief builds. Switching one off keeps the URL but skips it. Feeds set by an operator in BRIEF_FEEDS are added on top and cannot be edited here.",
    example: "You mute a news feed during a busy week with the toggle, then switch it back on without hunting for the URL again.",
    start: "Paste a feed URL and tap Add. Most blogs have one at /feed or /rss.",
  },
  persona: {
    title: "Persona",
    line: "The model of you a model reads before it answers: who you are, what you value, how you decide.",
    what: "Five kinds of entry — profile, values, preferences, decision rules, examples — each with a privacy tag. Local-only entries are never sent to a hosted model; the router drops them.",
    example: "A rule like \"when a tool costs more than $20 a month I try the free one for a week first\" makes Ask Myself answer the way you actually would.",
    start: "Add one value and one rule. Three entries is enough to notice the difference.",
  },
  ask: {
    title: "Ask Myself",
    line: "Pose a decision and get the answer your own persona implies, with the entries it leaned on.",
    what: "It answers from your persona and your Decision Deck swipes, not from general advice. It shows which entries it used, so you can disagree with the reasoning rather than just the answer.",
    example: "\"Should I take the bigger client or finish the side project?\" comes back weighed against the goals and values you wrote down.",
    start: "Type a real decision you are sitting on. One sentence is enough.",
  },
  deck: {
    title: "Decision Deck",
    line: "Two defensible options, one swipe. Each swipe teaches the persona how you actually lean.",
    what: "A short deck of dilemmas with no right answer. Your swipe (and how fast you made it) becomes evidence in your persona. Cards about money or people are local-only by construction.",
    example: "Five swipes in, Ask Myself stops hedging and starts sounding like somebody with your priorities.",
    start: "Swipe five cards. It takes about a minute.",
  },
  import: {
    title: "Import your context",
    line: "Bring what ChatGPT, Claude, Gemini, Notion or your notes already know about you — nothing is kept until you approve it.",
    what: "Upload an export or paste text; it is read into a review queue as candidate persona entries. Every candidate is local-only until you change it, and nothing enters your persona without your approval.",
    example: "A ChatGPT export turns into forty candidates; you approve eleven, and the Daily Brief starts ranking by them the same day.",
    start: "Pick the platform you use most and follow its three export steps.",
  },
  settings: {
    title: "Settings",
    line: "Which tools are on, which model answers, and what this instance has configured. No secret value is ever shown.",
    what: "Everything here comes from your .env file and from DATA_DIR. You can switch tools off, see which model would answer, and re-run the welcome walkthrough.",
    example: "You switch the Daily Brief off for a month; it leaves the sidebar and stops fetching anything.",
    start: "Scroll to Modules and toggle anything you do not want.",
  },
  welcome: {
    title: "Welcome walkthrough",
    line: "Eight short screens that set JollyOS up for you. Skip any of it; your place is saved.",
    what: "It asks what to call you, what you follow, how you like information, what must stay on this machine, and whether you have a model to point at. Your answers become persona entries and feeds — real configuration, not a tour.",
    example: "Tapping \"Accessibility\" and \"Self-hosting\" subscribes you to four working feeds and makes tomorrow's Brief lead with them.",
    start: "Tap Next. Nothing here is permanent, and you can run it again from Settings.",
  },
};

export const help = (key: keyof typeof HELP | string): HelpTopic | undefined => HELP[key];
