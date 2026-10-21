/**
 * lib/persona/interests — derive INTERESTS and AVOID-topics from the persona,
 * rank stories by them, and explain each match. Client-safe, pure, no I/O.
 * ────────────────────────────────────────────────────────────────────────────
 * Deterministic: a small topic catalog (keywords per topic) plus explicit
 * "I'm into X" phrases. Each derived interest inherits the MOST restrictive
 * privacy tag among the persona entries that produced it, and remembers where
 * those entries came from ("your ChatGPT import") so the Brief can say why a
 * story is shown.
 *
 * Privacy rule for the Brief: ranking is plain keyword matching on this
 * server, so local-only interests MAY rank stories. They are turned into
 * `local-only` ContextSegments for the summariser, which the provider router
 * withholds from any cloud model (tests/brief-personal.test.ts proves it).
 */
import { PATTERNS } from "@/lib/import/extract";
import { sourceLabel } from "@/lib/import/sources";
import type { ImportSource } from "@/lib/import/types";
import type { ContextSegment, Privacy } from "@/lib/providers/types";
import { hashString } from "@/lib/utils";

export interface Topic {
  id: string;
  label: string;
  keywords: string[];
}

export const TOPICS: Topic[] = [
  { id: "design-systems", label: "design systems", keywords: ["design system", "design systems", "component library", "design tokens", "figma", "ui kit", "style guide", "icon set", "icon sets"] },
  { id: "accessibility", label: "accessibility", keywords: ["accessibility", "a11y", "screen reader", "wcag", "reduced motion", "contrast", "aria"] },
  { id: "typography", label: "typography", keywords: ["typography", "typeface", "typefaces", "font", "fonts", "type scale"] },
  { id: "product-design", label: "product design", keywords: ["product design", "product designer", "ux", "user experience", "empty state", "empty states", "onboarding", "interface", "usability", "designer", "proposal", "proposals"] },
  { id: "ux-research", label: "user research", keywords: ["user research", "user interviews", "usability test", "usability testing", "survey"] },
  { id: "frontend", label: "front-end", keywords: ["frontend", "front-end", "javascript", "typescript", "web platform", "browser", "html"] },
  { id: "react-next", label: "React & Next.js", keywords: ["react", "next.js", "nextjs", "server components"] },
  { id: "css", label: "CSS", keywords: ["css", "tailwind", "flexbox", "grid layout", "stylesheet"] },
  { id: "indie-business", label: "indie business", keywords: ["indie", "side project", "side projects", "bootstrapped", "solo founder", "saas", "launch", "startup", "studio", "freelance", "client work", "small studio"] },
  { id: "pricing", label: "pricing", keywords: ["pricing", "free tier", "paid plan", "subscription", "revenue", "price"] },
  { id: "self-hosting", label: "self-hosting", keywords: ["self-host", "self-hosting", "self-hosted", "selfhosted", "homelab", "docker", "home server", "nas", "backups", "personal dashboard"] },
  { id: "open-source", label: "open source", keywords: ["open source", "open-source", "github", "license", "licence", "licences", "licenses", "maintainer"] },
  { id: "local-models", label: "local models", keywords: ["local model", "local models", "llama", "ollama", "lm studio", "on-device", "7b", "quantized", "offline model", "run locally", "private summaries", "privacy routing", "privacy tag"] },
  { id: "ai-tools", label: "AI tools", keywords: ["ai", "llm", "llms", "chatgpt", "claude", "gemini", "gpt", "prompt", "prompts", "agents", "machine learning"] },
  { id: "privacy-security", label: "privacy & security", keywords: ["privacy", "encryption", "tracking", "surveillance", "data breach", "security", "passwords", "gdpr", "secrets"] },
  { id: "productivity", label: "productivity", keywords: ["productivity", "focus", "deep work", "time blocking", "routine", "workflow", "morning blocks", "notes app"] },
  { id: "adhd-habits", label: "habits & ADHD", keywords: ["adhd", "habit", "habits", "streak", "streaks", "dopamine", "executive function", "habit tracker", "habit-tracking", "habit formation"] },
  { id: "writing", label: "writing", keywords: ["writing", "essay", "essays", "newsletter", "blog", "journaling", "editing"] },
  { id: "cycling", label: "cycling", keywords: ["cycling", "bike", "bikes", "bicycle", "gravel", "ride", "riding", "tour de france"] },
  { id: "outdoors", label: "outdoors", keywords: ["hiking", "trail", "camping", "climbing", "marathon", "outdoor", "outdoors", "trip", "trips"] },
  { id: "cooking", label: "cooking", keywords: ["cooking", "cook", "recipe", "recipes", "baking", "kitchen", "sourdough", "meal prep"] },
  { id: "photography", label: "photography", keywords: ["photography", "camera", "lens", "lightroom"] },
  { id: "science", label: "science", keywords: ["science", "physics", "biology", "research paper", "astronomy", "space", "nasa"] },
  { id: "climate", label: "climate", keywords: ["climate", "emissions", "renewable", "solar", "electric vehicle"] },
  { id: "music", label: "music", keywords: ["music", "album", "vinyl", "synth", "synths", "guitar", "concert"] },
  { id: "gaming", label: "gaming", keywords: ["gaming", "video game", "video games", "nintendo", "playstation", "xbox", "steam"] },
  { id: "cars", label: "cars", keywords: ["cars", "roadster", "track day", "engine", "jdm"] },
  { id: "home", label: "home", keywords: ["renovation", "diy", "furniture", "apartment", "mortgage", "interior"] },
  { id: "parenting", label: "parenting", keywords: ["parenting", "kids", "toddler", "daycare"] },
  { id: "personal-finance", label: "personal finance", keywords: ["personal finance", "budget", "budgeting", "savings", "investing", "index fund", "retirement", "taxes"] },
  { id: "crypto", label: "crypto", keywords: ["crypto", "bitcoin", "ethereum", "blockchain", "nft", "nfts", "web3", "memecoin", "token price"] },
  { id: "politics", label: "politics", keywords: ["election", "politics", "congress", "parliament", "senate", "campaign"] },
  { id: "celebrity", label: "celebrity gossip", keywords: ["celebrity", "celebrities", "gossip", "reality tv", "royal family", "red carpet"] },
  { id: "sports", label: "sports", keywords: ["football", "soccer", "basketball", "nba", "nfl", "baseball", "tennis", "golf", "premier league"] },
  // ── Added with the expanded "What you follow" catalog (lib/onboarding/topics).
  // A pick with no entry here still ranks: deriveInterests falls back to the
  // pick's own label as a custom keyword. These exist for the areas where one
  // label is not enough, and so lib/brief/feed-catalog.json can point at them.
  { id: "programming", label: "programming", keywords: ["programming", "python", "golang", "compiler", "api design", "sql", "database", "kubernetes", "devops", "refactor"] },
  { id: "motorsport", label: "motorsport", keywords: ["motorsport", "formula 1", "f1", "grand prix", "nascar", "indycar", "motogp", "rally", "le mans", "endurance racing", "qualifying"] },
  { id: "running", label: "running", keywords: ["running", "runner", "half marathon", "ultramarathon", "5k", "10k", "race pace"] },
  { id: "gardening", label: "gardening", keywords: ["gardening", "garden", "houseplant", "houseplants", "compost", "seedling", "perennial", "vegetable garden"] },
  { id: "film", label: "film", keywords: ["film", "films", "movie", "movies", "cinema", "screenplay", "box office"] },
  { id: "tv", label: "TV", keywords: ["tv", "tv show", "television", "series finale", "episode"] },
  { id: "books", label: "books", keywords: ["book", "books", "novel", "novels", "author", "nonfiction", "publisher"] },
  { id: "tabletop", label: "tabletop games", keywords: ["board game", "board games", "tabletop", "dungeons & dragons", "ttrpg"] },
  { id: "woodworking", label: "woodworking", keywords: ["woodworking", "joinery", "lathe", "workbench", "wood shop", "dovetail"] },
  { id: "3d-printing", label: "3D printing", keywords: ["3d print", "3d printing", "3d printer", "filament", "resin print", "slicer"] },
  { id: "making", label: "making & DIY", keywords: ["maker", "soldering", "arduino", "raspberry pi", "microcontroller", "breadboard"] },
  { id: "repair", label: "repair", keywords: ["repair", "right to repair", "teardown", "refurbish"] },
  { id: "spaceflight", label: "spaceflight", keywords: ["spaceflight", "rocket", "satellite", "orbit", "astronaut", "launch vehicle"] },
  { id: "fitness", label: "fitness", keywords: ["strength training", "workout", "gym", "squat", "deadlift", "powerlifting", "hypertrophy", "lifting"] },
  { id: "nutrition", label: "nutrition", keywords: ["nutrition", "protein", "calories", "meal plan", "macros"] },
  { id: "mental-health", label: "mental health", keywords: ["mental health", "anxiety", "depression", "therapy", "mindfulness", "burnout", "meditation"] },
  { id: "sleep", label: "sleep", keywords: ["sleep", "insomnia", "circadian", "sleep debt"] },
  { id: "coffee", label: "coffee", keywords: ["coffee", "espresso", "pour over", "barista", "roaster", "cold brew"] },
  { id: "drinks", label: "drinks", keywords: ["cocktail", "cocktails", "whisky", "whiskey", "wine", "beer", "brewing"] },
  { id: "career", label: "career", keywords: ["career", "resume", "job hunt", "interviewing", "promotion", "salary", "negotiation"] },
  { id: "management", label: "management", keywords: ["management", "manager", "leadership", "one-on-one", "hiring", "team lead"] },
  { id: "hardware", label: "hardware", keywords: ["laptop", "smartphone", "gpu", "cpu", "android", "iphone", "gadget"] },
  { id: "climbing", label: "climbing", keywords: ["climbing", "bouldering", "belay", "crag"] },
  { id: "snow-sports", label: "snow sports", keywords: ["skiing", "snowboard", "snowboarding", "powder day", "backcountry", "ski resort"] },
  { id: "fishing", label: "fishing", keywords: ["fishing", "angler", "fly fishing", "tackle"] },
  { id: "world-news", label: "world news", keywords: ["world news", "headlines", "breaking news", "foreign policy", "geopolitics"] },
];

const AVOID_RE = PATTERNS.filter((p) => p.category === "avoid").map((p) => p.re);
/** "I'm into X", "I follow X" → the X phrase. */
// The captured phrase may start with a digit ("3d printing"); without that a
// pick whose label begins with a number derives no interest at all.
const EXPLICIT_RE = /\b(?:I(?:'m| am) (?:into|interested in|following|getting into|obsessed with|curious about|a fan of|big on|deep into)|I (?:follow|keep up with|read about|nerd out (?:on|about))|(?:interested in|passionate about|love reading about)) ([a-z0-9][a-z0-9 '&-]{2,40}?)(?=[,.;:!]| and | or | because | so | but |$)/gi;

const PRIVACY_RANK: Record<Privacy, number> = { public: 0, "cloud-ok": 1, "local-only": 2 };
const stricter = (a: Privacy, b: Privacy): Privacy => (PRIVACY_RANK[a] >= PRIVACY_RANK[b] ? a : b);

export interface InterestInput {
  id: string;
  text: string;
  privacy: Privacy;
  source?: { kind: ImportSource; ref?: string } | null;
}

export interface Interest {
  topic: string;
  label: string;
  keywords: string[];
  /** How many persona entries point at it (capped when scoring). */
  weight: number;
  privacy: Privacy;
  /** Distinct provenance labels, e.g. "your ChatGPT import". */
  sources: string[];
  /** Persona entry ids. */
  evidence: string[];
}

export interface InterestProfile {
  interests: Interest[];
  avoid: Interest[];
  /** Changes whenever the derived set changes; the Brief cache keys on it. */
  version: string;
  computedAt: string;
}

export const EMPTY_PROFILE: InterestProfile = { interests: [], avoid: [], version: "none", computedAt: "" };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const keywordRe = (kw: string) => new RegExp(`(?<![a-z0-9])${escapeRe(kw.toLowerCase())}(?![a-z0-9])`, "i");

/** Catalog topics whose keywords appear in `text`. */
export function matchTopics(text: string, topics: Topic[] = TOPICS): { topic: Topic; hits: string[] }[] {
  const out: { topic: Topic; hits: string[] }[] = [];
  for (const topic of topics) {
    const hits = topic.keywords.filter((k) => keywordRe(k).test(text));
    if (hits.length) out.push({ topic, hits });
  }
  return out;
}

export const isAvoidStatement = (text: string) => AVOID_RE.some((re) => re.test(text));

const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function explicitPhrases(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(EXPLICIT_RE)) {
    const phrase = m[1].trim().replace(/\s+/g, " ").replace(/\s+(?:lately|recently|these days|right now|at the moment|now|too|as well|again|a lot|a bit)$/i, "");
    if (phrase.split(" ").length <= 3 && !/^(it|that|this|them|you|everything|anything|the)$/i.test(phrase)) out.push(phrase);
  }
  return out;
}

export function deriveInterests(entries: InterestInput[], now = new Date().toISOString()): InterestProfile {
  const interests = new Map<string, Interest>();
  const avoid = new Map<string, Interest>();

  const add = (bucket: Map<string, Interest>, topic: Topic, e: InterestInput) => {
    const src = sourceLabel(e.source?.kind);
    const cur = bucket.get(topic.id);
    if (cur) {
      cur.weight++;
      cur.privacy = stricter(cur.privacy, e.privacy);
      if (!cur.sources.includes(src)) cur.sources.push(src);
      cur.evidence.push(e.id);
    } else {
      bucket.set(topic.id, { topic: topic.id, label: topic.label, keywords: [...topic.keywords], weight: 1, privacy: e.privacy, sources: [src], evidence: [e.id] });
    }
  };

  for (const e of entries) {
    const text = e.text;
    const negative = isAvoidStatement(text);
    // Avoid statements only contribute to AVOID; a sentence like "skip crypto
    // news" must not also register crypto as an interest.
    const bucket = negative ? avoid : interests;
    for (const { topic } of matchTopics(text)) add(bucket, topic, e);
    if (!negative) {
      for (const phrase of explicitPhrases(text)) {
        if (matchTopics(phrase).length) continue; // already a catalog topic
        add(bucket, { id: `custom:${slug(phrase)}`, label: phrase.toLowerCase(), keywords: [phrase.toLowerCase()] }, e);
      }
    }
  }
  // A topic that is both wanted and avoided: the avoid wins, drop it from interests.
  for (const id of avoid.keys()) interests.delete(id);

  const sort = (m: Map<string, Interest>) => [...m.values()].sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label));
  const list = sort(interests);
  const avoidList = sort(avoid);
  const version = hashString(JSON.stringify([...list, ...avoidList].map((i) => [i.topic, i.weight, i.privacy, i.sources]))).toString(16);
  return { interests: list, avoid: avoidList, version: list.length || avoidList.length ? version : "none", computedAt: now };
}

// ── Ranking ────────────────────────────────────────────────────────────────

export interface StoryMatch {
  score: number;
  /** Labels of matched interests, best first. */
  matched: string[];
  avoided: string[];
  hidden: boolean;
  /** "matches: design systems, accessibility · from your ChatGPT import" */
  why: string | null;
}

const haystack = (s: { title: string; snippet?: string }) => `${s.title} ${s.snippet ?? ""}`;

export function scoreStory(story: { title: string; snippet?: string }, profile: InterestProfile): StoryMatch {
  const text = haystack(story);
  const matchedInterests = profile.interests.filter((i) => i.keywords.some((k) => keywordRe(k).test(text)));
  const avoided = profile.avoid.filter((i) => i.keywords.some((k) => keywordRe(k).test(text)));
  const score = matchedInterests.reduce((n, i) => n + Math.min(i.weight, 3), 0) - avoided.length * 10;
  const matched = matchedInterests.map((i) => i.label);
  const sources = [...new Set(matchedInterests.flatMap((i) => i.sources))].slice(0, 2);
  const why = matched.length ? `matches: ${matched.slice(0, 3).join(", ")} · from ${sources.join(" and ")}` : avoided.length ? `hidden: ${avoided.map((a) => a.label).join(", ")} is on your avoid list` : null;
  return { score, matched, avoided: avoided.map((a) => a.label), hidden: avoided.length > 0, why };
}

/** Sorted best-first; hidden stories go last and keep their flag. Stable for ties (by date, newest first). */
export function rankStories<T extends { title: string; snippet?: string; publishedAt?: string | null }>(stories: T[], profile: InterestProfile): (T & { match: StoryMatch })[] {
  const ranked = stories.map((s) => ({ ...s, match: scoreStory(s, profile) }));
  return ranked.sort((a, b) => {
    if (a.match.hidden !== b.match.hidden) return a.match.hidden ? 1 : -1;
    if (b.match.score !== a.match.score) return b.match.score - a.match.score;
    return (Date.parse(b.publishedAt ?? "") || 0) - (Date.parse(a.publishedAt ?? "") || 0);
  });
}

// ── Feed suggestions ───────────────────────────────────────────────────────

export interface FeedCatalogEntry {
  id: string;
  title: string;
  site: string;
  url: string;
  topics: string[];
}

export interface FeedSuggestion extends FeedCatalogEntry {
  /** Matched interest labels. */
  because: string[];
  why: string;
}

/**
 * Pure: proposes feeds, never subscribes. `exclude` is every URL already
 * configured or accepted; feeds touching an avoid-topic are left out.
 */
export function suggestFeeds(catalog: FeedCatalogEntry[], profile: InterestProfile, exclude: string[] = [], limit = 6): FeedSuggestion[] {
  const skip = new Set(exclude.map((u) => u.trim().toLowerCase()));
  const avoid = new Set(profile.avoid.map((a) => a.topic));
  const weight = new Map(profile.interests.map((i) => [i.topic, i] as const));
  const scored: (FeedSuggestion & { score: number })[] = [];
  for (const f of catalog) {
    if (skip.has(f.url.toLowerCase())) continue;
    if (f.topics.some((t) => avoid.has(t))) continue;
    const hits = f.topics.map((t) => weight.get(t)).filter((i): i is Interest => Boolean(i));
    if (!hits.length) continue;
    const score = hits.reduce((n, i) => n + Math.min(i.weight, 3), 0);
    const because = hits.map((i) => i.label);
    const sources = [...new Set(hits.flatMap((i) => i.sources))].slice(0, 2);
    scored.push({ ...f, because, why: `because you follow ${because.join(", ")} · from ${sources.join(" and ")}`, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit)
    .map((s) => { const { score: _score, ...rest } = s; return rest; });
}

// ── Prompt context ─────────────────────────────────────────────────────────

/** One tagged segment per interest, so the router can withhold the local-only ones. */
export function interestSegments(profile: InterestProfile): ContextSegment[] {
  const seg = (title: string, i: Interest): ContextSegment => ({ title, text: `- ${i.label}`, privacy: i.privacy });
  return [...profile.interests.map((i) => seg("interest", i)), ...profile.avoid.map((i) => seg("avoid topic", i))];
}

/** Public/cloud-ok interests as a flat list of labels (for UI chips). */
export function interestLabels(profile: InterestProfile, audience: "cloud" | "local" = "local"): string[] {
  return profile.interests.filter((i) => audience === "local" || i.privacy !== "local-only").map((i) => i.label);
}
