"use client";

/**
 * components/modules/Persona/ReviewQueue — approve, reject or edit each
 * candidate. Nothing reaches the persona until Approve. Rows update
 * optimistically; a failed write shows one line and reloads the truth.
 */
import { Check, Pencil, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { Chip, EmptyState } from "@/components/jolly/Foundation";
import { sourceInfo } from "@/lib/import/sources";
import { type Candidate, type CandidateCategory, CATEGORIES } from "@/lib/import/types";
import { PRIVACY_LEVELS } from "@/lib/persona/types";
import type { Privacy } from "@/lib/providers/types";
import { cn } from "@/lib/utils";
import { PrivacyChip } from "./PrivacyChip";

export type ReviewAction = "approve" | "reject" | "reset";

interface Props {
  items: Candidate[];
  onReview: (id: string, action: ReviewAction) => void;
  onEdit: (id: string, edits: { text?: string; category?: CandidateCategory; privacy?: Privacy }) => void;
  busyIds: Set<string>;
}

export function ReviewQueue({ items, onReview, onEdit, busyIds }: Props) {
  if (!items.length) return <EmptyState title="Nothing here">Pick another filter, or start a new import.</EmptyState>;
  return (
    <ul className="space-y-2">
      {items.map((c) => <Row key={c.id} c={c} busy={busyIds.has(c.id)} onReview={onReview} onEdit={onEdit} />)}
    </ul>
  );
}

function Row({ c, busy, onReview, onEdit }: { c: Candidate; busy: boolean; onReview: Props["onReview"]; onEdit: Props["onEdit"] }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.text);
  const pending = c.status === "pending";
  const pct = Math.round(c.confidence * 100);
  return (
    <li className={cn("rounded-control border border-subtle bg-surface-2/40 p-3", c.status === "approved" && "border-success/30", c.status === "rejected" && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-1.5">
        {pending ? (
          <select className="field !min-h-[36px] !w-auto !py-1 text-[12px]" value={c.category} onChange={(e) => onEdit(c.id, { category: e.target.value as CandidateCategory })} aria-label="Category">
            {CATEGORIES.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        ) : (
          <Chip tone="accent">{CATEGORIES.find((k) => k.id === c.category)?.label ?? c.category}</Chip>
        )}
        {pending ? (
          <select className="field !min-h-[36px] !w-auto !py-1 text-[12px]" value={c.privacy} onChange={(e) => onEdit(c.id, { privacy: e.target.value as Privacy })} aria-label="Privacy">
            {PRIVACY_LEVELS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        ) : (
          <PrivacyChip privacy={c.privacy} />
        )}
        <span className="ml-auto text-[11px] tabular-nums text-text-subtle" title="How confident the extractor was">{pct}%</span>
        {c.status === "approved" ? <Chip tone="success" icon={Check}>in your persona</Chip> : null}
        {c.status === "rejected" ? <Chip tone="neutral" icon={X}>rejected</Chip> : null}
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea className="field resize-y" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={1000} aria-label="Edit text" />
          <div className="flex gap-2">
            <button type="button" className="btn-primary" onClick={() => { onEdit(c.id, { text: draft }); setEditing(false); }} disabled={!draft.trim()}>Save</button>
            <button type="button" className="btn-quiet" onClick={() => { setDraft(c.text); setEditing(false); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm leading-relaxed">{c.text}</p>
      )}

      <p className="mt-1.5 truncate text-[11px] text-text-subtle" title={c.sourceRef}>
        {sourceInfo(c.source).label} · {c.sourceRef}{c.mode !== "rules" ? ` · ${c.mode} model` : ""}
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {pending ? (
          <>
            <button type="button" className="btn-primary flex-1 sm:flex-none" disabled={busy} onClick={() => onReview(c.id, "approve")}><Check size={16} aria-hidden="true" />Approve</button>
            <button type="button" className="btn-ghost flex-1 sm:flex-none" disabled={busy} onClick={() => onReview(c.id, "reject")}><X size={16} aria-hidden="true" />Reject</button>
            {!editing ? <button type="button" className="btn-quiet" onClick={() => setEditing(true)} aria-label="Edit text"><Pencil size={16} aria-hidden="true" />Edit</button> : null}
          </>
        ) : c.status === "rejected" ? (
          <button type="button" className="btn-quiet" disabled={busy} onClick={() => onReview(c.id, "reset")}><RotateCcw size={14} aria-hidden="true" />Restore</button>
        ) : null}
      </div>
    </li>
  );
}
