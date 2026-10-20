"use client";

/**
 * components/modules/Jobs/CaptureBox — the fastest path from thought to card.
 * First line becomes the title, the rest the brief. Enter submits; Shift+Enter
 * adds a line. Used on the board and on the home page.
 */
import { Mic } from "lucide-react";
import { useState } from "react";
import { Notice } from "@/components/jolly/Foundation";
import type { Job } from "@/lib/jobs/types";

export function CaptureBox({ onCaptured, autoFocus = false }: { onCaptured?: (job: Job) => void; autoFocus?: boolean }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  async function capture() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: body }) });
      const data = (await res.json()) as { job?: Job; error?: string };
      if (!res.ok || !data.job) { setNote({ tone: "danger", text: data.error ?? "Could not capture that." }); return; }
      setText("");
      setNote({ tone: "success", text: `Captured "${data.job.title}" into the inbox.` });
      onCaptured?.(data.job);
    } catch {
      setNote({ tone: "danger", text: "Network error — nothing was saved." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="sr-only" htmlFor="capture-text">Capture</label>
      <div className="flex gap-2">
        <textarea
          id="capture-text"
          className="field min-h-[44px] resize-y"
          rows={2}
          value={text}
          autoFocus={autoFocus}
          placeholder="Capture a thought. The first line becomes the title."
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void capture(); } }}
        />
        <button type="button" className="btn-primary shrink-0 self-end" onClick={() => void capture()} disabled={busy || !text.trim()}>
          <Mic size={16} aria-hidden="true" />
          {busy ? "Saving…" : "Capture"}
        </button>
      </div>
      <p className="text-[12px] text-text-subtle">Enter saves · Shift+Enter adds a line</p>
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
    </div>
  );
}
