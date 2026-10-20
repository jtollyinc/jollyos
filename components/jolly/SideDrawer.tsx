"use client";

/**
 * components/jolly/SideDrawer — a right-hand sheet on a native <dialog>.
 * The platform gives us focus trapping, Escape and background inertness for
 * free; this component only syncs the `open` prop to showModal()/close().
 */
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

export function SideDrawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className="m-0 ml-auto h-dvh max-h-none w-full max-w-md border-l border-strong bg-surface p-0 text-text-primary shadow-modal backdrop:bg-black/60"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b border-subtle p-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" aria-label={`Close ${title}`} onClick={onClose} className="btn-quiet"><X size={20} aria-hidden="true" /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </dialog>
  );
}
