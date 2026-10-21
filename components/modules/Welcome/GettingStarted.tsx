"use client";

/**
 * components/modules/Welcome/GettingStarted — the Home checklist after setup.
 * ────────────────────────────────────────────────────────────────────────────
 * Every row is derived from real state (lib/onboarding/checklist), so a tick
 * means the thing actually happened — no stored "I pressed done" flags, nothing
 * to groom. Dismissing it is the only thing stored, and that is reversible from
 * Settings, so the card can never become a nag.
 */
import { Check, ListChecks, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/jolly/Foundation";
import { checklistProgress, type ChecklistItem } from "@/lib/onboarding/checklist";

export function GettingStarted({ items }: { items: ChecklistItem[] }) {
  const [hidden, setHidden] = useState(false);
  const { done, total } = checklistProgress(items);

  function dismiss() {
    setHidden(true);
    void fetch("/api/welcome", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "hide-checklist" }) });
  }

  if (hidden) return null;

  return (
    <Card className="mb-4 p-4">
      <div className="mb-2.5 flex items-center gap-2">
        <ListChecks size={18} className="shrink-0 text-accent-soft" aria-hidden="true" />
        <h2 className="min-w-0 flex-1 text-sm font-semibold">
          Getting started
          <span className="ml-2 font-normal tabular-nums text-text-muted">{done} of {total}</span>
        </h2>
        <button type="button" className="btn-quiet -mr-2 shrink-0" aria-label="Hide the getting started list" onClick={dismiss}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${item.done ? "border-success bg-success/20 text-success" : "border-strong"}`}
            >
              {item.done ? <Check size={12} /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block text-sm ${item.done ? "text-text-subtle line-through" : "font-medium"}`}>{item.label}</span>
              {item.done ? null : <span className="block text-[12px] leading-snug text-text-muted">{item.hint}</span>}
            </span>
            {item.done ? (
              <span className="sr-only">done</span>
            ) : (
              <Link href={item.href} className="btn-ghost !min-h-10 shrink-0 text-[13px]">{item.cta}</Link>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
