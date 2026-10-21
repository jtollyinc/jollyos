"use client";

/**
 * components/modules/Persona/PersonaEditor — add, tag and remove the entries
 * that make up the model of you. Grouped by kind; each entry shows its privacy
 * tag so you always know what a cloud model could see.
 */
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Card, CollapsibleSection, EmptyState, Notice, PageHeader, PageShell } from "@/components/jolly/Foundation";
import { HELP } from "@/lib/help";
import { PERSONA_KINDS, PRIVACY_LEVELS, type PersonaEntry, type PersonaKind } from "@/lib/persona/types";
import type { Privacy } from "@/lib/providers/types";
import { PersonaTabs } from "./PersonaTabs";
import { PrivacyChip } from "./PrivacyChip";

interface PersonaResponse { entries: PersonaEntry[]; counts: { total: number; public: number; "cloud-ok": number; "local-only": number } }

export function PersonaEditor() {
  const [data, setData] = useState<PersonaResponse | null>(null);
  const [kind, setKind] = useState<PersonaKind>("value");
  const [privacy, setPrivacy] = useState<Privacy>("cloud-ok");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      fetch("/api/persona", { cache: "no-store" })
        .then((res) => (res.ok ? (res.json() as Promise<PersonaResponse>) : Promise.reject(new Error(String(res.status)))))
        .then((json) => setData(json))
        .catch(() => setError("Could not load the persona.")),
    [],
  );
  useEffect(() => { void load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/persona", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, text, privacy }) });
      if (!res.ok) { setError(((await res.json()) as { error?: string }).error ?? "Could not save."); return; }
      setText("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/persona/${id}`, { method: "DELETE" });
    await load();
  }

  const counts = data?.counts;
  return (
    <PageShell>
      <PageHeader title="Persona" help={HELP.persona} />
      <PersonaTabs />

      <Card className="mb-4 p-4">
        <form onSubmit={add} className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-label font-semibold uppercase tracking-wider text-text-muted">
              Kind
              <select className="field" value={kind} onChange={(e) => setKind(e.target.value as PersonaKind)}>
                {PERSONA_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-label font-semibold uppercase tracking-wider text-text-muted">
              Privacy
              <select className="field" value={privacy} onChange={(e) => setPrivacy(e.target.value as Privacy)}>
                {PRIVACY_LEVELS.map((p) => <option key={p.id} value={p.id}>{p.label} — {p.hint}</option>)}
              </select>
            </label>
          </div>
          <p className="text-[13px] text-text-muted">{PERSONA_KINDS.find((k) => k.id === kind)?.hint}</p>
          <div className="flex gap-2">
            <textarea className="field resize-y" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="One clear sentence." maxLength={1000} aria-label="Entry text" />
            <button type="submit" className="btn-primary shrink-0 self-end" disabled={busy || !text.trim()}><Plus size={16} aria-hidden="true" />Add</button>
          </div>
          {error ? <Notice tone="danger">{error}</Notice> : null}
        </form>
      </Card>

      {counts ? (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-[13px] text-text-muted">
          {counts.total} entries · <PrivacyChip privacy="public" /> {counts.public} · <PrivacyChip privacy="cloud-ok" /> {counts["cloud-ok"]} · <PrivacyChip privacy="local-only" /> {counts["local-only"]}
        </p>
      ) : null}

      {data && data.entries.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          action={<><Link href="/welcome" className="btn-primary">Answer eight questions</Link><Link href="/persona/import" className="btn-ghost">Import instead</Link></>}
        >
          Three entries are enough for Ask Myself to start sounding like you: one value, one decision rule, one line about what you do. Add them in the box above, let the welcome walkthrough ask you, or import what ChatGPT already knows.
        </EmptyState>
      ) : null}

      <div className="space-y-3">
        {PERSONA_KINDS.map((k) => {
          const entries = (data?.entries ?? []).filter((e) => e.kind === k.id);
          if (!entries.length) return null;
          return (
            <CollapsibleSection key={k.id} panelId={`persona:${k.id}`} title={k.label} count={entries.length} teaser={entries[0]?.text} accent="you" defaultCollapsed={false}>
              <ul className="space-y-2">
                {entries.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 rounded-control border border-subtle bg-surface-2/40 p-3">
                    <p className="min-w-0 flex-1 text-sm leading-relaxed">{e.text}</p>
                    <PrivacyChip privacy={e.privacy} />
                    <button type="button" className="btn-quiet -my-2 text-danger" onClick={() => void remove(e.id)} aria-label={`Delete entry: ${e.text.slice(0, 40)}`}><Trash2 size={16} aria-hidden="true" /></button>
                  </li>
                ))}
              </ul>
            </CollapsibleSection>
          );
        })}
      </div>
    </PageShell>
  );
}
