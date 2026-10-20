/**
 * lib/import/extract — the rule-based extractor: owner's words in, candidate
 * persona items out. Pure, deterministic, always available (no model needed).
 * ────────────────────────────────────────────────────────────────────────────
 * It splits each MinedText into sentences and keeps the ones that read like a
 * durable statement about the owner: "I prefer…", "always/never…", "my rule…",
 * "I'm a…", "I decided…", "I'm into…", "don't show me … news". Requests to an
 * assistant ("can you write…") and questions are dropped. Memory bullets and
 * custom-instruction lines are trusted more (they were already distilled).
 * Each hit carries a confidence so the review queue can sort the likely ones
 * first. Nothing here decides privacy: every candidate is born local-only.
 */
import type { CandidateCategory, ExtractedItem, MinedText } from "./types";

interface Pattern {
  category: CandidateCategory;
  re: RegExp;
}

/** Order matters: the first match wins, so the specific (avoid) beat the general (preference). */
export const PATTERNS: Pattern[] = [
  // Avoid-topics
  { category: "avoid", re: /\b(?:not interested in|no interest in|zero interest in)\b/i },
  { category: "avoid", re: /\b(?:don'?t|do not|never|stop|please don'?t) (?:show|send|recommend|suggest|bring up|mention|give|feed) me\b/i },
  { category: "avoid", re: /\b(?:avoid|skip|mute|ignore|filter out|hide|tired of|sick of|no more|fewer|less)\b[^.;]{0,60}\b(?:news|stories|articles|updates|takes|hype|drama|coverage|content|posts|headlines)\b/i },
  { category: "avoid", re: /\bI (?:avoid|hate|can'?t stand|don'?t (?:care|want to hear|follow) about)\b[^.;]{0,60}\b(?:news|coverage|hype|discourse|drama|gossip|headlines)\b/i },
  // Rules
  { category: "rule", re: /^(?:always|never) \b/i },
  { category: "rule", re: /\b(?:I|we) (?:always|never) \b/i },
  { category: "rule", re: /\b(?:my|the|one|a|house) rule(?: of thumb)?\b/i },
  { category: "rule", re: /\b(?:please )?(?:always|never|don'?t|do not|avoid) (?:use|write|add|include|start|end|assume|suggest|give|explain|apologi[sz]e|repeat|ask|put|make|open|pad|hedge|moralize|moralise)\b/i },
  { category: "rule", re: /\b(?:if|when|whenever|unless|before|after) \b[^,.;]{3,80}, (?:I|then I|I'?ll|I will|I don'?t|I never|I always|we)\b/i },
  { category: "rule", re: /\b(?:non-?negotiable|hard rule|no exceptions|every time)\b/i },
  // Decision patterns
  { category: "decision-pattern", re: /\bI (?:decided|chose|went with|picked|ended up|opted|turned down|said no to|declined|shipped|killed)\b/i },
  { category: "decision-pattern", re: /\b(?:situation|the call|call|why|lesson|outcome):/i },
  { category: "decision-pattern", re: /\b(?:lesson learned|next time I(?:'ll| will)|in hindsight|looking back|what I learned)\b/i },
  // Values
  { category: "value", re: /\bI (?:value|care (?:most )?about|optimi[sz]e for|believe in|stand for)\b/i },
  { category: "value", re: /\b(?:matters? most|most important|what I care about|non-?negotiables?|first principle)\b/i },
  { category: "value", re: /\b(?:quality|clarity|honesty|simplicity|speed|craft|calm|privacy|trust) (?:first|over|before|beats)\b/i },
  // Interests
  { category: "interest", re: /\bI(?:'m| am) (?:into|interested in|following|learning|getting into|obsessed with|curious about|a fan of|big on|deep into)\b/i },
  { category: "interest", re: /\bI (?:follow|read|track|collect|ride|cook|bake|play|run|climb|hike|tinker with|watch|listen to|keep up with) \b/i },
  { category: "interest", re: /\bmy (?:hobby|hobbies|side project|weekends?|free time|evenings)\b/i },
  { category: "interest", re: /\b(?:interested in|keen on|passionate about|love reading about|nerd out (?:on|about))\b/i },
  // Preferences
  { category: "preference", re: /\bI(?:'d| would)? (?:prefer|rather)\b/i },
  { category: "preference", re: /\bI (?:like|love|enjoy|hate|dislike|can'?t stand|don'?t like|appreciate)\b/i },
  { category: "preference", re: /\bI (?:usually|tend to|generally|typically|normally|mostly|default to)\b/i },
  { category: "preference", re: /\bI (?:want|need|expect) (?:everything|all|my|things|answers|responses|replies|you to|short|brief|direct)\b/i },
  { category: "preference", re: /\b(?:user|they|he|she) (?:prefers?|likes?|wants?|dislikes?|enjoys?)\b/i },
  { category: "preference", re: /\b(?:keep|make) (?:it|things|answers|responses|replies|explanations) (?:short|brief|concise|simple|direct|tight|plain)\b/i },
  { category: "preference", re: /\b(?:free|paid|open[- ]source|self[- ]hosted|local) (?:tools?|plans?|software|models?|first|before|over)\b/i },
  { category: "preference", re: /\bworks? best (?:in|with|when|at)\b/i },
  // Facts
  { category: "fact", re: /\bI(?:'m| am) (?:a|an|the) \b/i },
  { category: "fact", re: /\bI work (?:as|at|on|for|in|with|from)\b/i },
  { category: "fact", re: /\bmy (?:job|role|team|company|studio|partner|wife|husband|kids?|daughter|son|dog|cat|city|time ?zone|schedule|background|day job|commute|week|mornings?|afternoons?)\b/i },
  { category: "fact", re: /\bI (?:live|lived|moved|grew up) in\b/i },
  { category: "fact", re: /\bI(?:'ve| have) been (?:working|building|doing|running|using|designing)\b/i },
  { category: "fact", re: /^(?:the )?user (?:is|works|lives|has|runs|uses|splits|spends)\b/i },
  { category: "fact", re: /\b(?:call me|my name is|I go by)\b/i },
  { category: "fact", re: /\bI(?:'m| am) (?:based|located|working) (?:in|at|on|from)\b/i },
];

/** Things said TO an assistant, not ABOUT the owner. */
const REQUEST_RE = /^(?:can|could|would|will) you\b|^(?:please )?(?:help|write|draft|summari[sz]e|explain|give|make|generate|translate|fix|rewrite|list|tell|show|create|suggest|review|check|compare|find|look) (?:me|up|this|that|a|an|the|it|out|at)?\b|^(?:how|what|why|where|which|who|when) (?:do|does|is|are|should|can|would|did|about)\b|^(?:here(?:'s| is)|below is|this is the|attached)\b/i;

const MIN_LEN = 12;
const MAX_LEN = 400;
const MAX_ITEMS = 400;

/** Sentence-ish split: on terminal punctuation followed by space + an opener, and on newlines. */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n+|(?<=[.!?])\s+(?=["“(\-A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function tidy(s: string): string {
  let t = s.replace(/\s+/g, " ").trim();
  t = t.replace(/^(?:also|and|but|so|anyway|btw|fyi|note|oh|ok|okay)[,:]\s+/i, "");
  if (t) t = t[0].toUpperCase() + t.slice(1);
  return t;
}

const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function classify(sentence: string): CandidateCategory | null {
  for (const p of PATTERNS) if (p.re.test(sentence)) return p.category;
  return null;
}

function confidence(sentence: string, kind: MinedText["kind"], matched: boolean): number {
  let c = matched ? 0.55 : 0.4;
  if (/^(?:I|my|I'm|I've|I'd|we|our)\b/i.test(sentence)) c += 0.15;
  if (kind === "memory" || kind === "instruction") c += 0.15;
  if (sentence.length > 240) c -= 0.15;
  if (kind === "message" && /\byou\b/i.test(sentence) && !/\b(?:don'?t|never|always|please)\b/i.test(sentence)) c -= 0.1;
  return Math.round(Math.min(0.95, Math.max(0.2, c)) * 100) / 100;
}

export interface ExtractOptions {
  /** Drop candidates below this confidence (default 0.45). */
  minConfidence?: number;
}

export interface ExtractResult {
  items: ExtractedItem[];
  /** How many sentences were looked at. */
  considered: number;
  truncated: boolean;
}

export function extractCandidates(mined: MinedText[], opts: ExtractOptions = {}): ExtractResult {
  const min = opts.minConfidence ?? 0.45;
  const best = new Map<string, ExtractedItem>();
  let considered = 0;

  for (const m of mined) {
    // Distilled sources (memory bullets, instruction lines) are one item each; prose is split.
    const units = m.kind === "memory" || m.kind === "instruction" ? [m.text.replace(/\s+/g, " ").trim()] : splitSentences(m.text);
    for (const raw of units) {
      considered++;
      if (raw.length < MIN_LEN || raw.length > MAX_LEN) continue;
      if (/https?:\/\/|```|<[a-z]+>/i.test(raw)) continue;
      if (m.kind === "message" && REQUEST_RE.test(raw)) continue;
      if (raw.endsWith("?") && m.kind !== "instruction") continue;
      const category = classify(raw) ?? (m.kind === "memory" ? "fact" : m.kind === "instruction" ? "rule" : null);
      if (!category) continue;
      const text = tidy(raw);
      const conf = confidence(raw, m.kind, classify(raw) !== null);
      if (conf < min) continue;
      const key = normKey(text);
      const prev = best.get(key);
      if (!prev || prev.confidence < conf) best.set(key, { category, text, ref: m.ref, confidence: conf });
    }
  }

  const items = [...best.values()].sort((a, b) => b.confidence - a.confidence || a.text.localeCompare(b.text));
  return { items: items.slice(0, MAX_ITEMS), considered, truncated: items.length > MAX_ITEMS };
}
