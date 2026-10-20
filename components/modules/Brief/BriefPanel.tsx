"use client";

/**
 * components/modules/Brief/BriefPanel — the Daily Brief page.
 * One HeroStrip with the day's one-line truth, then sections that are folded
 * by default and remember the fold. Each source section carries the model's
 * summary and the stories; "Your jobs" and "Your decisions" need no model.
 */
import { Activity, Bot, ListChecks, Newspaper, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CollapsibleSection, HeroStrip, Notice, PageHeader, PageShell, Prose, StoryCard } from "@/components/jolly/Foundation";
import type { Brief, BriefSection } from "@/lib/brief/types";
import { ago } from "@/lib/utils";

const ICONS = { news: Newspaper, jobs: Bot, decisions: ListChecks, you: Activity, today: Activity } as const;

export function BriefPanel() {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setBusy(false);
  }

  return (
    <PageShell>
      <PageHeader title="Daily Brief" lede={brief ? `Built ${ago(brief.generatedAt)} · ${brief.provider} (${brief.model})` : error ? "Not available" : "Building…"}>
        <button type="button" className="btn-ghost" onClick={() => void refresh()} disabled={busy}>
          <RefreshCw size={16} className={busy ? "animate-spin" : undefined} aria-hidden="true" />
          {busy ? "Building…" : "Refresh"}
        </button>
      </PageHeader>

      {error ? <Notice tone="danger" className="mb-4">{error}</Notice> : null}
      {brief ? (
        <>
          <HeroStrip title="Right now" icon={<Activity size={12} aria-hidden="true" />} action={{ href: "/jobs", label: "Open jobs" }}>{brief.headline}</HeroStrip>
          <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
            {brief.sections.map((s) => <Section key={s.id} section={s} />)}
          </div>
          <footer className="mt-4 space-y-1 text-[12px] text-text-subtle">
            <p>Sources: {brief.sources.map((s) => `${s.label} (${s.ok ? `${s.count} stories` : `failed: ${s.note ?? "unknown"}`})`).join(" · ") || "none"}</p>
            {brief.routeNote ? <p>Privacy: {brief.routeNote}</p> : null}
          </footer>
        </>
      ) : !error ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-card bg-surface" />)}</div>
      ) : null}
    </PageShell>
  );
}

function Section({ section }: { section: BriefSection }) {
  const Icon = ICONS[section.accent] ?? Newspaper;
  const teaser = section.summary.split("\n")[0]?.replace(/^-\s*/, "") ?? "";
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
      {section.stories.length ? (
        <div className="space-y-2">
          {section.stories.map((s) => <StoryCard key={s.id} title={s.title} href={s.url} source={s.source} date={s.publishedAt}>{s.snippet}</StoryCard>)}
        </div>
      ) : null}
    </CollapsibleSection>
  );
}
