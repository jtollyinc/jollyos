"use client";

/**
 * components/modules/Brief/FeedsEditor — the feeds the Brief reads, editable.
 * ────────────────────────────────────────────────────────────────────────────
 * The reason this exists: a one-click user has no .env to put BRIEF_FEEDS in,
 * so "add a feed" has to be a text box. Add any RSS/Atom URL, switch one off
 * without losing it, or remove it. Feeds an operator set in BRIEF_FEEDS are
 * listed read-only — they are not ours to turn off.
 *
 * Every change invalidates the day's brief cache server-side, so Refresh picks
 * it up immediately.
 */
import { Plus, Rss, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CollapsibleSection, EmptyState, Notice } from "@/components/jolly/Foundation";
import { HelpButton } from "@/components/jolly/HelpButton";
import { HELP } from "@/lib/help";

interface OwnedFeed {
  url: string;
  title: string;
  enabled?: boolean;
  because: string[];
}

interface FeedsPayload {
  accepted: OwnedFeed[];
  configured: string[];
  demo: boolean;
}

const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };

export function FeedsEditor({ onChange, defaultCollapsed = true }: { onChange?: () => void; defaultCollapsed?: boolean }) {
  const [data, setData] = useState<FeedsPayload | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Promise callbacks, not await: state changes land outside the effect body.
  const load = useCallback(
    () =>
      fetch("/api/brief/feeds", { cache: "no-store" })
        .then((res) => (res.ok ? (res.json() as Promise<FeedsPayload>) : Promise.reject(new Error(String(res.status)))))
        .then((json) => setData(json))
        .catch(() => setError("Could not load your feeds.")),
    [],
  );

  useEffect(() => { void load(); }, [load]);

  async function send(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/brief/feeds", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => null)) as (FeedsPayload & { error?: string }) | null;
      if (!res.ok) { setError(json?.error ?? "That did not work."); return false; }
      if (json) setData(json);
      onChange?.();
      return true;
    } catch {
      setError("Network error — is the server still running?");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    if (await send("POST", { url: trimmed })) setUrl("");
  }

  const owned = data?.accepted ?? [];
  const live = owned.filter((f) => f.enabled !== false).length + (data?.configured.length ?? 0);

  return (
    <CollapsibleSection
      panelId="brief:feeds"
      title="Your feeds"
      icon={<Rss size={18} aria-hidden="true" />}
      count={owned.length + (data?.configured.length ?? 0)}
      teaser={live ? `${live} switched on — tap to add or mute one` : "None yet — tap to add your first"}
      accent="news"
      defaultCollapsed={defaultCollapsed}
    >
      <div className="mb-3 flex items-start gap-1">
        <p className="min-w-0 flex-1 text-[13px] text-text-muted">{HELP.feeds.line}</p>
        <HelpButton topic={HELP.feeds} className="-mt-3 shrink-0" />
      </div>

      <form onSubmit={add} className="mb-3 flex flex-col gap-2 sm:flex-row">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Feed URL</span>
          <input
            className="field"
            type="url"
            inputMode="url"
            placeholder="https://example.com/feed"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoCapitalize="none"
            spellCheck={false}
          />
        </label>
        <button type="submit" className="btn-primary shrink-0" disabled={busy || !url.trim()}>
          <Plus size={16} aria-hidden="true" />Add feed
        </button>
      </form>
      {error ? <Notice tone="danger" className="mb-3">{error}</Notice> : null}

      {owned.length ? (
        <ul className="space-y-2">
          {owned.map((f) => {
            const on = f.enabled !== false;
            return (
              <li key={f.url} className="flex items-center gap-2 rounded-control border border-subtle bg-surface-2/40 p-3">
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-semibold leading-snug ${on ? "" : "text-text-subtle line-through"}`}>{f.title}</p>
                  <p className="truncate text-[12px] text-text-muted">{host(f.url)}{f.because.length ? ` · ${f.because.slice(0, 2).join(", ")}` : ""}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`${on ? "Switch off" : "Switch on"} ${f.title}`}
                  disabled={busy}
                  onClick={() => void send("PATCH", { url: f.url, enabled: !on })}
                  className={`touch-target shrink-0 rounded-control px-3 text-label font-bold uppercase tracking-wider ${on ? "bg-accent/20 text-accent-soft" : "bg-surface-2 text-text-subtle"}`}
                >
                  {on ? "On" : "Off"}
                </button>
                <button
                  type="button"
                  className="btn-quiet shrink-0"
                  aria-label={`Remove ${f.title}`}
                  disabled={busy}
                  onClick={() => void send("DELETE", { url: f.url })}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title="No feeds of your own yet">
          Paste any blog&rsquo;s RSS or Atom URL above, or pick topics in the welcome walkthrough and it fills this list for you.
        </EmptyState>
      )}

      {data?.configured.length ? (
        <p className="mt-3 text-[12px] text-text-subtle">
          Also reading {data.configured.length} feed{data.configured.length === 1 ? "" : "s"} from the <code>BRIEF_FEEDS</code> setting. Those belong to whoever runs this server and cannot be changed here.
        </p>
      ) : null}
      {data?.demo ? <p className="mt-2 text-[12px] text-text-subtle">Demo mode shows fixtures instead of fetching these. They are fetched for real once demo mode is off.</p> : null}
    </CollapsibleSection>
  );
}
