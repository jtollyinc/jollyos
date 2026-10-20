/**
 * lib/brief/rss — a deliberately tiny RSS/Atom reader.
 * ────────────────────────────────────────────────────────────────────────────
 * No XML dependency: feeds in the wild are messy, and the brief only needs
 * title, link, date and a snippet per item. Regex extraction is forgiving of
 * namespaces, CDATA and half-broken markup, which is exactly what a parser
 * would choke on. `parseFeed` is pure and unit-testable; `fetchFeed` adds the
 * network with a timeout. SERVER-SIDE ONLY.
 */
import crypto from "node:crypto";
import type { Story } from "./types";

export interface ParsedFeed {
  title: string;
  stories: Story[];
}

const cdata = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
const strip = (s: string) =>
  cdata(s)
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function tag(block: string, name: string): string | null {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return m ? m[1] : null;
}

function link(block: string): string | null {
  const text = tag(block, "link");
  if (text && strip(text)) return strip(text);
  const href = /<link[^>]*\shref=["']([^"']+)["']/i.exec(block);
  return href ? href[1] : null;
}

function date(block: string): string | null {
  const raw = tag(block, "pubDate") ?? tag(block, "published") ?? tag(block, "updated") ?? tag(block, "dc:date");
  if (!raw) return null;
  const t = Date.parse(strip(raw));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export function parseFeed(xml: string, fallbackTitle: string, limit = 12): ParsedFeed {
  const items = [...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].map((m) => m[2]);
  const head = xml.slice(0, items.length ? xml.search(/<(item|entry)[\s>]/i) : xml.length);
  const feedTitle = strip(tag(head, "title") ?? "") || fallbackTitle;

  const stories: Story[] = [];
  for (const block of items) {
    const title = strip(tag(block, "title") ?? "");
    const url = link(block);
    if (!title || !url) continue;
    const snippet = strip(tag(block, "description") ?? tag(block, "summary") ?? tag(block, "content") ?? "").slice(0, 220);
    stories.push({
      id: crypto.createHash("sha1").update(url).digest("hex").slice(0, 12),
      title: title.slice(0, 200),
      url,
      source: feedTitle,
      publishedAt: date(block),
      snippet,
    });
    if (stories.length >= limit) break;
  }
  return { title: feedTitle, stories };
}

export async function fetchFeed(url: string, timeoutMs = 10_000): Promise<ParsedFeed> {
  const res = await fetch(url, {
    headers: { "User-Agent": "JollyOS/0.1 (+brief)", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const host = (() => { try { return new URL(url).hostname; } catch { return url; } })();
  return parseFeed(xml, host);
}
