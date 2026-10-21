"use client";

/**
 * components/jolly/HelpButton — the small (?) next to a page title.
 * ────────────────────────────────────────────────────────────────────────────
 * A 44px button that opens a native <dialog>, so the platform gives us focus
 * trapping, Escape and an inert background for free (same trick as SideDrawer).
 * The content is three short answers from lib/help: what it does, one example,
 * how to start.
 *
 * On a phone the dialog sits at the bottom with a full-width Got it button; on
 * a desktop it is centred. No scroll inside it — if a topic needs scrolling it
 * is too long for this component.
 */
import { HelpCircle, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { HelpTopic } from "@/lib/help";

export function HelpButton({ topic, className }: { topic: HelpTopic; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`What is ${topic.title}?`}
        className={`touch-target inline-flex items-center justify-center rounded-full text-text-subtle hover:bg-white/[0.06] hover:text-text-primary ${className ?? ""}`}
      >
        <HelpCircle size={18} aria-hidden="true" />
      </button>

      <dialog
        ref={ref}
        aria-labelledby={headingId}
        onCancel={(e) => { e.preventDefault(); setOpen(false); }}
        onClick={(e) => { if (e.target === ref.current) setOpen(false); }}
        className="m-0 mt-auto w-full max-w-lg rounded-t-card border border-strong bg-surface p-0 text-text-primary shadow-modal backdrop:bg-black/60 sm:m-auto sm:rounded-card"
      >
        <div className="flex items-start justify-between gap-3 border-b border-subtle p-4">
          <h2 id={headingId} className="text-base font-semibold">{topic.title}</h2>
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="btn-quiet -mr-2 -mt-2 shrink-0">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="space-y-3 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-5">
          <Answer label="What it does">{topic.what}</Answer>
          <Answer label="For example">{topic.example}</Answer>
          <Answer label="Start here">{topic.start}</Answer>
          <button type="button" className="btn-primary w-full" onClick={() => setOpen(false)}>Got it</button>
        </div>
      </dialog>
    </>
  );
}

function Answer({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-label font-bold uppercase tracking-wider text-text-subtle">{label}</p>
      <p className="mt-0.5 text-sm leading-relaxed text-text-primary">{children}</p>
    </div>
  );
}
