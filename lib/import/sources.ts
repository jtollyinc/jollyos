/**
 * lib/import/sources — what the Import page says about each source.
 * Client-safe: plain data. The export steps mirror docs/importing-context.md
 * and come from the official help pages linked here (checked 2026-10-20).
 * UIs change: when a step disagrees with the official page, the page wins.
 */
import type { ImportSource } from "./types";

export interface SourceInfo {
  id: ImportSource;
  label: string;
  /** One line under the tile. */
  blurb: string;
  /** Which inputs make sense: file upload, paste, or a server folder path. */
  inputs: ("file" | "paste" | "folder")[];
  /** File picker filter. */
  accept: string;
  /** Short official steps, one per line, as the official page states them. */
  steps: string[];
  official: { label: string; url: string }[];
  /** Anchor in docs/importing-context.md. */
  docAnchor: string;
  /** What the importer does with the file, and what it assumes. */
  importer: string;
}

export const SOURCES: SourceInfo[] = [
  {
    id: "chatgpt",
    label: "ChatGPT",
    blurb: "Data export zip, or paste your Memory and custom instructions.",
    inputs: ["file", "paste"],
    accept: ".zip,.json,.txt",
    steps: [
      "Sign in to ChatGPT → profile menu → Settings → Data controls.",
      "Under Export data, select Export, then Confirm export.",
      "Wait for the email or SMS (up to 7 days); the download link expires after 24 hours.",
      "Upload the zip here, or just conversations.json from inside it.",
      "Memory: Settings → Personalization → Memory. Copy what is listed and paste it below.",
      "Custom instructions: Settings → Personalization (Customize ChatGPT on phones). Copy both boxes and paste them below.",
    ],
    official: [
      { label: "Exporting your ChatGPT history and data", url: "https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data" },
      { label: "Memory in ChatGPT", url: "https://help.openai.com/en/articles/8590148-memory-faq" },
      { label: "Custom instructions", url: "https://help.openai.com/en/articles/8096356-custom-instructions-for-chatgpt" },
    ],
    docAnchor: "chatgpt",
    importer: "Reads conversations.json (the mapping tree; only your own messages, along the active branch). The tree layout is observed, not officially documented.",
  },
  {
    id: "claude",
    label: "Claude",
    blurb: "Data export zip, or paste Claude's memory and your project instructions.",
    inputs: ["file", "paste"],
    accept: ".zip,.json,.txt",
    steps: [
      "On claude.ai go to Settings → Privacy and click Export data (not available from the phone apps).",
      "Wait for the email; the download link expires after 24 hours.",
      "Upload the zip here, or conversations.json and projects.json from inside it.",
      "Memory: Settings → Memory lists everything under Topics. Or ask Claude: “Write out your memories of me verbatim, exactly as they appear in your memory.” Paste the result below.",
      "Project instructions: open a project → Set project instructions. Copy the text and paste it below.",
    ],
    official: [
      { label: "Export your Claude data", url: "https://support.claude.com/en/articles/9450526-export-your-claude-data" },
      { label: "Import and export your memory", url: "https://support.claude.com/en/articles/12123587-import-and-export-your-memory-from-claude" },
      { label: "Chat search and memory", url: "https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context" },
      { label: "Create and manage projects", url: "https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects" },
    ],
    docAnchor: "claude",
    importer: "Reads conversations.json (human turns only) and projects.json (your instructions). File names and shape are observed from exports, not officially documented; unknown fields are ignored.",
  },
  {
    id: "gemini",
    label: "Gemini",
    blurb: "Google Takeout: My Activity → Gemini Apps.",
    inputs: ["file", "paste"],
    accept: ".zip,.json,.txt",
    steps: [
      "Go to takeout.google.com and choose Deselect all.",
      "Check My Activity → All activity data included → Deselect all → check Gemini Apps → OK.",
      "Next step → pick .zip → Create export. Google emails a link when it is ready.",
      "Upload the zip (or the Gemini Apps MyActivity.json inside it). If Takeout gave you HTML, open it and paste the text you typed instead.",
    ],
    official: [
      { label: "Download your Gemini Apps data", url: "https://support.google.com/gemini/answer/16920332" },
      { label: "How to download your Google data", url: "https://support.google.com/accounts/answer/3024190" },
    ],
    docAnchor: "gemini",
    importer: "Reads My Activity JSON rows whose title starts with “Prompted” — the shape is assumed from Takeout archives, not documented. HTML exports are not parsed: paste instead.",
  },
  {
    id: "notion",
    label: "Notion",
    blurb: "Export as Markdown & CSV; upload the zip.",
    inputs: ["file"],
    accept: ".zip,.md,.txt",
    steps: [
      "On any page: ••• (top right) → Export → Markdown & CSV → switch on Include subpages → Export.",
      "Whole workspace: Settings → General → Export all workspace content; Notion emails a link.",
      "Upload the zip here. Markdown pages are read; CSV databases are skipped.",
    ],
    official: [{ label: "Export your content", url: "https://www.notion.com/help/export-your-content" }],
    docAnchor: "notion",
    importer: "Reads every .md in the zip, paragraph by paragraph. CSV files are table data and are skipped.",
  },
  {
    id: "markdown",
    label: "Obsidian / Markdown",
    blurb: "Any folder of .md or .txt notes — upload files, a zip, or point at a folder in DATA_DIR.",
    inputs: ["file", "folder"],
    accept: ".md,.markdown,.txt,.zip",
    steps: [
      "Obsidian stores notes as plain Markdown files in your vault folder — there is nothing to export.",
      "Select the files (or zip the folder) and upload, or copy the folder into DATA_DIR and give its path.",
    ],
    official: [{ label: "How Obsidian stores data", url: "https://obsidian.md/help/data-storage" }],
    docAnchor: "obsidian-and-markdown-folders",
    importer: "Reads paragraphs and list items; skips front matter, code and tables. Each item points back to file › heading › line.",
  },
  {
    id: "apple-notes",
    label: "Apple Notes",
    blurb: "Export single notes as Markdown on a Mac, or copy and paste.",
    inputs: ["file", "paste"],
    accept: ".md,.txt,.zip",
    steps: [
      "On a Mac: select a note → File → Export To → Markdown (or PDF). One note at a time.",
      "Upload the .md files, or select the text of a note and paste it below.",
      "Bulk: privacy.apple.com → Request a copy of your data includes the notes synced to your Apple account, but Apple does not state the file format.",
    ],
    official: [
      { label: "Import, export and print notes (Mac)", url: "https://support.apple.com/guide/notes/import-export-and-print-notes-not201900c07/mac" },
      { label: "Get a copy of your Apple Account data", url: "https://support.apple.com/en-us/102208" },
    ],
    docAnchor: "apple-notes",
    importer: "Markdown exports are read as notes; pasted text is read line by line.",
  },
  {
    id: "paste",
    label: "Paste anything",
    blurb: "A memory dump, custom instructions, a bio, a list of rules.",
    inputs: ["paste"],
    accept: ".txt,.md",
    steps: [
      "Paste text. Headings like “Saved memories” or “Custom instructions” tell the extractor to trust those lines more.",
    ],
    official: [],
    docAnchor: "paste-box",
    importer: "Bullets become one candidate each; paragraphs are split into sentences.",
  },
];

export const sourceInfo = (id: ImportSource): SourceInfo => SOURCES.find((s) => s.id === id) ?? SOURCES[SOURCES.length - 1];

/** "your ChatGPT import" — used by the Brief's why-line. */
export function sourceLabel(id: ImportSource | undefined): string {
  switch (id) {
    case "chatgpt": return "your ChatGPT import";
    case "claude": return "your Claude import";
    case "gemini": return "your Gemini import";
    case "notion": return "your Notion import";
    case "markdown": return "your notes import";
    case "apple-notes": return "your Apple Notes import";
    case "paste": return "your pasted text";
    default: return "your persona";
  }
}
