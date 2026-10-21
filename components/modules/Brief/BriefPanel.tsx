"use client";

/**
 * components/modules/Brief/BriefPanel — the Daily Brief page.
 * One HeroStrip with the day's one-line truth, then sections that are folded
 * by default and remember the fold. Each source section carries the model's
 * summary and the stories; "Your jobs" and "Your decisions" need no model.
 *
 * Personal layer: a strip of the interests the brief was ranked by, a
 * "Feeds for you" card whose suggestions do nothing until Accept, a why-line
 * under each matched story, and avoid-topic stories behind "show hidden".
 *
 * With no feeds at all the page says so and offers the two ways to fix it
 * (pick topics, or paste a URL into FeedsEditor) — never a blank screen.
 */
import { Activity, ArrowRight, Bot, Check, EyeOff, ListChecks, Newspaper, Plus, RefreshCw, Rss, Sparkles, Target } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Chip, CollapsibleSection, EmptyState, HeroStrip, Notice, PageHeader, PageShell, Prose, StoryCard } from "@/components/jolly/Foundation";
import { HELP } from "@/lib/help";
import { FeedsEditor } from "./FeedsEditor";
import type { Brief, BriefSection } from "@/lib/brief/types";
import type { FeedSuggestion } from "@/lib/persona/interests";
import { ago } from "@/lib/utils";

const ICONS = { news: Newspaper, jobs: Bot, decisions: ListChecks, you: Activity, today: Activity } as const;

export function BriefPanel() {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the feed list changes: rebuilding costs a model call, so the
  // owner decides when to spend it.
  const [stale, setStale] = useState(false);

  const fetchBrief = useCallback(
    (refresh: boolean) =>
      fetch("/api/brief", { method: refresh ? "POST" : "GET", cache: "no-store" })
        .then((res) => (res.ok ? (res.json() as Promise<{ brief: Brief }>) : Promise.reject(new Error(String(res.status)))))
        .then((json) => { setBrief(json.brief); setError(null); })
        .catch(() => setError("Could not build the brief.")),
    [],
  );

  // First load: state changes happen in the promise callbacks above.
  useEffect(() => { void fetchBrief(false); }, [fetchBrief]);

  async function refresh() {
    setBusy(true);
    await fetchBrief(true);
    setStale(false);
    setBusy(false);
  }

  return (
    <PageShell>
      <PageHeader title="Daily Brief" help={HELP.brief} lede={brief ? `Built ${ago(brief.generatedAt)} · ${brief.provider} (${brief.model})` : error ? "Not available" : "Building…"}>
        <button type="button" className="btn-ghost" onClick={() => void refresh()} disabled={busy}>
          <RefreshCw size={16} className={busy ? "animate-spin" : undefined} aria-hidden="true" />
          {busy ? "Building…" : "Refresh"}
        </button>
      </PageHeader>

      {error ? <Notice tone="danger" className="mb-4">{error}</Notice> : null}
      {brief ? (
        <>
          <HeroStrip title="Right now" icon={<Activity size={12} aria-hidden="true" />} action={{ href: "/jobs", label: "Open jobs" }}>{brief.headline}</HeroStrip>
          <PersonalStrip brief={brief} />
          {stale ? <Notice tone="info" className="mb-3">Your feeds changed. Tap Refresh to rebuild today&rsquo;s brief with them.</Notice> : null}
          {brief.sources.length ? null : (
            <EmptyState
              title="No feeds yet, so there is nothing to read"
              action={<Link href="/welcome" className="btn-primary">Pick your topics</Link>}
            >
              Pick a few topics and JollyOS subscribes you to working public feeds, or open <strong>Your feeds</strong> below and paste any blog&rsquo;s RSS URL. Your jobs and your decisions already have sections here either way.
            </EmptyState>
          )}
          <div className="mt-3 grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
            <FeedsEditor defaultCollapsed={brief.sources.length > 0} onChange={() => setStale(true)} />
            {brief.suggestions.length ? <Suggestions initial={brief.suggestions} defaultCollapsed={brief.sources.length > 0} /> : null}
            {brief.sections.map((s) => <Section key={s.id} section={s} />)}
          </div>
          <footer className="mt-4 space-y-1 text-[12px] text-text-subtle">
            <p>Sources: {brief.sources.map((s) => `${s.label} (${s.ok ? `${s.count} stories` : `failed: ${s.note ?? "unknown"}`})`).join(" · ") || "none"}</p>
            {brief.routeNote ? <p>Privacy: {brief.routeNote}</p> : null}
            {brief.personal ? <p>Personal: ranked by {brief.personal.interests} interest{brief.personal.interests === 1 ? "" : "s"}{brief.personal.localOnly ? ` (${brief.personal.localOnly} local-only — used for ranking here, never sent to a cloud model)` : ""}; {brief.personal.avoid} avoid topic{brief.personal.avoid === 1 ? "" : "s"}.</p> : null}
          </footer>
        </>
      ) : !error ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-card bg-surface" />)}</div>
      ) : null}
    </PageShell>
  );
}

/** What this brief was tuned by — or the one-line invitation to tune it. */
function PersonalStrip({ brief }: { brief: Brief }) {
  const p = brief.personal;
  if (!p) {
    return (
      <Notice tone="info" className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <span className="flex min-w-0 flex-1 items-start gap-2"><Sparkles size={16} className="mt-1 shrink-0 text-accent-soft" aria-hidden="true" /><span>Import what ChatGPT, Claude or your notes know about you and this brief gets personal: ranked by your interests, feeds you might want, and a why-line on every story.</span></span>
        <Link href="/persona/import" className="btn-ghost !min-h-10 shrink-0 text-[13px]">Import your context <ArrowRight size={14} aria-hidden="true" /></Link>
      </Notice>
    );
  }
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[12px] text-text-muted">
      <Sparkles size={14} className="text-accent-soft" aria-hidden="true" />
      <span className="font-semibold text-text-primary">For you:</span>
      {p.topics.slice(0, 6).map((t) => <Chip key={t} tone="accent">{t}</Chip>)}
      {p.topics.length > 6 ? <span>+{p.topics.length - 6} more</span> : null}
      {p.hidden ? <Chip tone="neutral" icon={EyeOff}>{p.hidden} hidden</Chip> : null}
      <span className="text-text-subtle">from {p.sources.slice(0, 3).join(", ")}{p.sources.length > 3 ? ` +${p.sources.length - 3}` : ""}</span>
      <Link href="/persona/import" className="ml-auto text-text-subtle underline-offset-2 hover:underline">Tune</Link>
    </div>
  );
}

/** Suggested feeds. Proposals only: Accept is the only thing that subscribes. */
function Suggestions({ initial, defaultCollapsed = false }: { initial: FeedSuggestion[]; defaultCollapsed?: boolean }) {
  const [items, setItems] = useState(initial);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);

  async function accept(s: FeedSuggestion) {
    setBusy(s.url);
    try {
      const res = await fetch("/api/brief/feeds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: s.url, title: s.title, because: s.because }) });
      if (res.ok) {
        const json = (await res.json()) as { demo?: boolean };
        setDemo(Boolean(json.demo));
        setAccepted((a) => new Set(a).add(s.url));
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <CollapsibleSection panelId="brief:suggestions" title="Feeds for you" icon={<Rss size={18} aria-hidden="true" />} count={items.length} teaser={items[0] ? `${items[0].title} — ${items[0].why}` : ""} accent="you" defaultCollapsed={defaultCollapsed}>
      <p className="mb-2 text-[13px] text-text-muted">Picked from a small public catalog by your interests. Nothing is subscribed until you tap Accept.{demo ? " Demo mode keeps showing fixtures; accepted feeds are fetched when demo mode is off." : ""}</p>
      <ul className="space-y-2">
        {items.map((s) => {
          const done = accepted.has(s.url);
          return (
            <li key={s.url} className="flex items-center gap-3 rounded-control border border-subtle bg-surface-2/40 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-snug">{s.title} <span className="font-normal text-text-subtle">· {s.site}</span></p>
                <p className="text-[12px] text-text-muted">{s.why}</p>
              </div>
              {done ? (
                <Chip tone="success" icon={Check}>accepted</Chip>
              ) : (
                <button type="button" className="btn-ghost shrink-0" disabled={busy === s.url} onClick={() => void accept(s)} aria-label={`Accept ${s.title}`}>
                  <Plus size={16} aria-hidden="true" />Accept
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {items.length && accepted.size === items.length ? <button type="button" className="btn-quiet mt-2 text-[13px]" onClick={() => setItems([])}>Done</button> : null}
    </CollapsibleSection>
  );
}

function Section({ section }: { section: BriefSection }) {
  const Icon = ICONS[section.accent] ?? Newspaper;
  const [showHidden, setShowHidden] = useState(false);
  const teaser = section.summary.split("\n")[0]?.replace(/^-\s*/, "") ?? "";
  const visible = section.stories.filter((s) => !s.hidden);
  const hidden = section.stories.filter((s) => s.hidden);
  return (
    <CollapsibleSection
      panelId={`brief:${section.id}`}
      title={section.title}
      icon={<Icon size={18} aria-hidden="true" />}
      count={section.stories.length || undefined}
      teaser={teaser}
      accent={section.accent}
      defaultCollapsed
    >
      <Prose text={section.summary} className="mb-3" />
      {section.facts.length ? (
        <ul className="mb-3 flex flex-wrap gap-1.5">
          {section.facts.map((f) => <li key={f} className="rounded-full bg-surface-2 px-2.5 py-1 text-[12px] text-text-muted">{f}</li>)}
        </ul>
      ) : null}
      {visible.length ? (
        <div className="space-y-2">
          {visible.map((s) => (
            <StoryCard key={s.id} title={s.title} href={s.url} source={s.source} date={s.publishedAt}>
              {s.snippet}
              {s.goal ? <span className="mt-1 flex items-start gap-1 text-[12px] font-semibold text-success"><Target size={11} className="mt-[3px] shrink-0" aria-hidden="true" />For your goal: {s.goal.want}</span> : null}
              {s.why ? <span className="mt-1 flex items-start gap-1 text-[12px] text-accent-soft"><Sparkles size={11} className="mt-[3px] shrink-0" aria-hidden="true" />{s.why}</span> : null}
            </StoryCard>
          ))}
        </div>
      ) : null}
      {hidden.length ? (
        <div className="mt-2">
          <button type="button" className="btn-quiet text-[13px]" aria-expanded={showHidden} onClick={() => setShowHidden((v) => !v)}>
            <EyeOff size={14} aria-hidden="true" />
            {showHidden ? "Hide" : "Show"} {hidden.length} hidden
          </button>
          {showHidden ? (
            <div className="mt-2 space-y-2 opacity-75">
              {hidden.map((s) => (
                <StoryCard key={s.id} title={s.title} href={s.url} source={s.source} date={s.publishedAt}>
                  {s.snippet}
                  {s.why ? <span className="mt-1 flex items-start gap-1 text-[12px] text-text-subtle"><EyeOff size={11} className="mt-[3px] shrink-0" aria-hidden="true" />{s.why}</span> : null}
                </StoryCard>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </CollapsibleSection>
  );
}
