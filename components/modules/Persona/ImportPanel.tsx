"use client";

/**
 * components/modules/Persona/ImportPanel — "Import your context", in three
 * steps on one screen: pick a source → add the file / paste / folder and
 * choose how to extract → review the queue. One primary action per step,
 * 44px targets, the how-to folded, the cloud path behind an explicit opt-in
 * that names the provider. The server (lib/import/run) enforces the same gate.
 */
import { AlertTriangle, ArrowRight, Check, CloudUpload, FileText, Loader2, Lock, Sparkles, Trash2, Upload, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Notice, PageHeader, PageShell } from "@/components/jolly/Foundation";
import { SOURCES, sourceInfo } from "@/lib/import/sources";
import type { Candidate, CandidateCategory, CandidateStatus, ExtractionMode, ImportBatch, ImportSource } from "@/lib/import/types";
import type { Privacy } from "@/lib/providers/types";
import { cn } from "@/lib/utils";
import { PersonaTabs } from "./PersonaTabs";
import { ReviewQueue, type ReviewAction } from "./ReviewQueue";
import { SourceSteps } from "./SourceSteps";

interface Options {
  demo: boolean;
  localAvailable: boolean;
  localProvider: { label: string; model: string } | null;
  defaultProvider: { label: string; model: string; kind: "cloud" | "local" | "demo" };
}
interface ImportResponse {
  options: Options;
  queue: Candidate[];
  counts: { total: number; pending: number; approved: number; rejected: number };
  batches: ImportBatch[];
  raw: { files: number; bytes: number; batches: number };
}
interface Receipt {
  added: number;
  detected: string[];
  stats: { conversations: number; messages: number; files: number; skipped: number };
  note: string;
  warnings: string[];
}

type Step = "source" | "add" | "review";

const kb = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export function ImportPanel() {
  const [data, setData] = useState<ImportResponse | null>(null);
  const [step, setStep] = useState<Step>("source");
  const [source, setSource] = useState<ImportSource | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [paste, setPaste] = useState("");
  const [folder, setFolder] = useState("");
  const [mode, setMode] = useState<ExtractionMode>("rules");
  const [optIn, setOptIn] = useState(false);
  const [keepRaw, setKeepRaw] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [filter, setFilter] = useState<CandidateStatus>("pending");
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [showWarnings, setShowWarnings] = useState(false);

  // Promise chain, not an async body: state changes happen in the callbacks.
  const load = useCallback(
    (opts: { jumpToReview?: boolean } = {}) =>
      fetch("/api/import", { cache: "no-store" })
        .then((res) => (res.ok ? (res.json() as Promise<ImportResponse>) : Promise.reject(new Error(String(res.status)))))
        .then((json) => {
          setData(json);
          if (opts.jumpToReview && json.counts.pending > 0) setStep("review");
          return json;
        })
        .catch(() => { setError("Could not load the import queue."); return null; }),
    [],
  );

  useEffect(() => { void load({ jumpToReview: true }); }, [load]);

  const info = source ? sourceInfo(source) : null;
  const opts = data?.options;
  const cloudIsReallyCloud = opts ? opts.defaultProvider.kind !== "local" : true;
  const hasInput = files.length > 0 || paste.trim().length > 0 || folder.trim().length > 0;
  const canSubmit = hasInput && !busy && (mode !== "cloud" || optIn || !cloudIsReallyCloud);

  const queue = useMemo(() => (data?.queue ?? []).filter((c) => c.status === filter), [data, filter]);

  function pick(id: ImportSource) {
    setSource(id);
    setFiles([]); setPaste(""); setFolder(""); setOptIn(false); setError(null); setReceipt(null);
    setStep("add");
  }

  async function submit() {
    if (!source || !canSubmit) return;
    setBusy(true); setError(null);
    try {
      const form = new FormData();
      form.set("source", source); form.set("mode", mode); form.set("cloudOptIn", optIn ? "true" : "false");
      if (!keepRaw) form.set("discardRaw", "true");
      if (paste.trim()) form.set("paste", paste);
      if (folder.trim()) form.set("folder", folder.trim());
      for (const f of files) form.append("files", f, f.name);
      const res = await fetch("/api/import", { method: "POST", body: form });
      const json = (await res.json()) as { error?: string; options?: ExtractionMode[]; added?: Candidate[]; detected?: string[]; stats?: Receipt["stats"]; warnings?: string[]; extraction?: { note: string } };
      if (!res.ok) { setError(json.error ?? "Import failed."); return; }
      setReceipt({ added: json.added?.length ?? 0, detected: json.detected ?? [], stats: json.stats ?? { conversations: 0, messages: 0, files: 0, skipped: 0 }, note: json.extraction?.note ?? "", warnings: json.warnings ?? [] });
      setFilter("pending");
      await load();
      setStep("review");
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setBusy(false);
    }
  }

  async function trySample() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/import/sample", { method: "POST" });
      const json = (await res.json()) as { error?: string; added?: number; batches?: number; warnings?: string[] };
      if (!res.ok) { setError(json.error ?? "Could not load the samples."); return; }
      setReceipt({ added: json.added ?? 0, detected: ["ChatGPT conversations", "Claude conversations", "notes", "pasted text"], stats: { conversations: 5, messages: 0, files: 5, skipped: 0 }, note: `Four fictional sample batches for Alex Rivera, rule-based.`, warnings: json.warnings ?? [] });
      setFilter("pending");
      await load();
      setStep("review");
    } finally {
      setBusy(false);
    }
  }

  function patchLocal(id: string, patch: Partial<Candidate>) {
    setData((d) => (d ? { ...d, queue: d.queue.map((c) => (c.id === id ? { ...c, ...patch } : c)) } : d));
  }

  async function review(id: string, action: ReviewAction) {
    const prev = data?.queue.find((c) => c.id === id);
    if (!prev) return;
    const next: CandidateStatus = action === "approve" ? "approved" : action === "reject" ? "rejected" : "pending";
    patchLocal(id, { status: next });
    setBusyIds((s) => new Set(s).add(id));
    try {
      const res = await fetch(`/api/import/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      if (!res.ok) { setError("That change did not save; reloading."); await load(); return; }
      setData((d) => (d ? { ...d, counts: recount(d.queue) } : d));
    } finally {
      setBusyIds((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  }

  async function edit(id: string, edits: { text?: string; category?: CandidateCategory; privacy?: Privacy }) {
    patchLocal(id, edits);
    const res = await fetch(`/api/import/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "edit", ...edits }) });
    if (!res.ok) { setError("That edit did not save; reloading."); await load(); }
  }

  async function bulk(action: "approve" | "reject", minConfidence?: number) {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/import/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, minConfidence }) });
      if (!res.ok) setError("Bulk action failed.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteRaw() {
    setBusy(true);
    try {
      await fetch("/api/import/raw", { method: "DELETE" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  const counts = data?.counts;

  return (
    <PageShell width="narrow">
      <PageHeader title="Import your context" lede="Bring what ChatGPT, Claude, Gemini, Notion or your notes already know about you. Nothing enters your persona until you approve it." />
      <PersonaTabs />

      <Stepper step={step} canReview={(counts?.total ?? 0) > 0} onGo={(s) => { if (s === "source" || (s === "add" && source) || (s === "review" && counts?.total)) setStep(s); }} />

      {error ? <Notice tone="danger" className="mb-3">{error}</Notice> : null}

      {step === "source" ? (
        <div className="space-y-3">
          {opts?.demo && (counts?.total ?? 0) === 0 ? (
            <Card className="border-accent/25 bg-accent/[0.06] p-4">
              <p className="text-sm">Demo mode: see the whole flow on fictional exports for Alex Rivera — a ChatGPT and a Claude export, three notes and a pasted memory dump.</p>
              <button type="button" className="btn-primary mt-3 w-full sm:w-auto" onClick={() => void trySample()} disabled={busy}>
                {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
                Try with sample data
              </button>
            </Card>
          ) : null}
          <p className="text-label font-bold uppercase tracking-widest text-text-subtle">Where is it coming from?</p>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {SOURCES.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => pick(s.id)} className="touch-target h-full w-full rounded-card border border-subtle bg-surface p-3 text-left hover:border-accent/40 hover:bg-surface-hover">
                  <span className="block text-sm font-semibold">{s.label}</span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-text-muted">{s.blurb}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-text-subtle"><Lock size={11} className="inline align-[-1px]" aria-hidden="true" /> Everything you import is tagged local-only until you loosen it, item by item.</p>
        </div>
      ) : null}

      {step === "add" && info && opts ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">{info.label}</h2>
            <button type="button" className="btn-quiet text-[13px]" onClick={() => setStep("source")}>Change source</button>
          </div>
          <SourceSteps info={info} />

          <Card className="space-y-4 p-4">
            {info.inputs.includes("file") ? (
              <div>
                <p className="text-label font-bold uppercase tracking-widest text-text-subtle">Files</p>
                <label className="btn-ghost mt-1.5 w-full cursor-pointer sm:w-auto">
                  <Upload size={16} aria-hidden="true" />
                  Choose files
                  <input type="file" multiple accept={info.accept} className="sr-only" onChange={(e) => setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])} />
                </label>
                {files.length ? (
                  <ul className="mt-2 space-y-1">
                    {files.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-control bg-surface-2/60 px-3 py-1.5 text-[13px]">
                        <FileText size={14} className="shrink-0 text-text-subtle" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{f.name}</span>
                        <span className="text-text-subtle">{kb(f.size)}</span>
                        <button type="button" className="btn-quiet -my-2 !min-h-9 !min-w-9" aria-label={`Remove ${f.name}`} onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}><X size={14} aria-hidden="true" /></button>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-1.5 text-[12px] text-text-subtle">Accepts {info.accept.replaceAll(",", ", ")}. Zips are opened here.</p>}
              </div>
            ) : null}

            {info.inputs.includes("paste") ? (
              <label className="block">
                <span className="text-label font-bold uppercase tracking-widest text-text-subtle">{info.inputs.includes("file") ? "Or paste" : "Paste"}</span>
                <textarea className="field mt-1.5 resize-y" rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={source === "paste" ? "Memory dump, custom instructions, a bio, your rules…" : `What ${info.label} remembers about you, your custom instructions…`} />
              </label>
            ) : null}

            {info.inputs.includes("folder") ? (
              <label className="block">
                <span className="text-label font-bold uppercase tracking-widest text-text-subtle">Or a folder inside DATA_DIR</span>
                <input className="field mt-1.5" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="notes/vault" />
                <span className="mt-1 block text-[12px] text-text-subtle">Only paths inside DATA_DIR are read; files there are not copied.</span>
              </label>
            ) : null}

            <fieldset>
              <legend className="text-label font-bold uppercase tracking-widest text-text-subtle">How to find the items</legend>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Extraction mode">
                <ModeButton active={mode === "rules"} onClick={() => setMode("rules")} label="Rules" hint="no model · instant" />
                <ModeButton active={mode === "local"} onClick={() => setMode("local")} disabled={!opts.localAvailable} label="Local model" hint={opts.localAvailable ? `${opts.localProvider?.model ?? "ready"}` : "not configured"} />
                <ModeButton active={mode === "cloud"} onClick={() => setMode("cloud")} label={cloudIsReallyCloud ? "Cloud" : "Default"} hint={cloudIsReallyCloud ? `${opts.defaultProvider.label}` : "your default is local"} warn={cloudIsReallyCloud} />
              </div>
              <p className="mt-1.5 text-[12px] text-text-subtle">
                {mode === "rules" ? "Deterministic patterns (“I prefer…”, “always/never…”, memory bullets). Nothing is sent anywhere." : null}
                {mode === "local" ? `Your own model (${opts.localProvider?.label ?? "local"}) reads the text; it never leaves this machine. Rules fill in behind it.` : null}
                {mode === "cloud" && !cloudIsReallyCloud ? "Your default provider is the local model, so nothing leaves this machine." : null}
              </p>
            </fieldset>

            {mode === "cloud" && cloudIsReallyCloud ? (
              <Notice tone="warning">
                <p className="flex items-start gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" /><span><strong>This leaves your machine.</strong> Everything you add here — the files and the pasted text — is sent to <strong>{opts.defaultProvider.label}</strong> ({opts.defaultProvider.model}) to find persona items. The items it finds are still saved local-only.</span></p>
                <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-strong bg-surface px-3">
                  <input type="checkbox" className="h-5 w-5 accent-[rgb(var(--accent-rgb))]" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
                  <span className="text-sm">Send this batch to {opts.defaultProvider.label}</span>
                </label>
                {!opts.localAvailable ? <p className="mt-2 text-[12px] text-text-muted">Prefer to keep it local? Set LOCAL_LLM_BASE_URL and pick “Local model”, or stay on Rules.</p> : null}
              </Notice>
            ) : null}

            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[13px] text-text-muted">
              <input type="checkbox" className="h-4 w-4" checked={keepRaw} onChange={(e) => setKeepRaw(e.target.checked)} />
              Keep a copy of the uploads in DATA_DIR/imports/raw (you can delete them later)
            </label>

            <button type="button" className="btn-primary w-full" onClick={() => void submit()} disabled={!canSubmit}>
              {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : mode === "cloud" && cloudIsReallyCloud ? <CloudUpload size={16} aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
              {busy ? "Reading…" : "Find persona items"}
            </button>
          </Card>
        </div>
      ) : null}

      {step === "review" && data ? (
        <div className="space-y-3">
          {receipt ? (
            <Notice tone="info">
              <p><strong>{receipt.added} candidate{receipt.added === 1 ? "" : "s"}</strong> from {receipt.detected.join(", ") || "the import"}{receipt.stats.conversations ? ` · ${receipt.stats.conversations} conversation${receipt.stats.conversations === 1 ? "" : "s"}` : ""}{receipt.stats.messages ? `, ${receipt.stats.messages} of your messages` : ""}. {receipt.note}</p>
              {receipt.warnings.length ? (
                <button type="button" className="mt-1 text-[12px] text-text-muted underline-offset-2 hover:underline" onClick={() => setShowWarnings((v) => !v)}>{showWarnings ? "Hide" : "Show"} {receipt.warnings.length} note{receipt.warnings.length === 1 ? "" : "s"}</button>
              ) : null}
              {showWarnings ? <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12px] text-text-muted">{receipt.warnings.map((w) => <li key={w}>{w}</li>)}</ul> : null}
            </Notice>
          ) : null}

          {counts && counts.approved > 0 ? (
            <Notice tone="success" className="flex flex-wrap items-center gap-2">
              <Check size={16} className="text-success" aria-hidden="true" />
              <span className="flex-1">{counts.approved} in your persona · interests refreshed.</span>
              <Link href="/brief" className="btn-ghost !min-h-10 text-[13px]">See your Brief <ArrowRight size={14} aria-hidden="true" /></Link>
            </Notice>
          ) : null}

          <div className="flex flex-wrap items-center gap-1.5">
            {(["pending", "approved", "rejected"] as CandidateStatus[]).map((s) => (
              <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)} className={cn("touch-target rounded-control border px-3 text-[13px] font-semibold capitalize", filter === s ? "border-accent/60 bg-accent/15 text-text-primary" : "border-strong bg-surface-2 text-text-muted")}>
                {s} <span className="tabular-nums text-text-subtle">{counts?.[s] ?? 0}</span>
              </button>
            ))}
            <button type="button" className="btn-quiet ml-auto text-[13px]" onClick={() => { setReceipt(null); setStep("source"); }}>New import</button>
          </div>

          {filter === "pending" && (counts?.pending ?? 0) > 1 ? (
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className="btn-ghost flex-1 text-[13px] sm:flex-none" disabled={busy} onClick={() => void bulk("approve")} aria-label="Approve all pending">Approve all</button>
              <button type="button" className="btn-ghost flex-1 text-[13px] sm:flex-none" disabled={busy} onClick={() => void bulk("approve", 0.7)} title="Approve every pending item the extractor was at least 70% sure about">Approve ≥ 70%</button>
              <button type="button" className="btn-ghost flex-1 text-[13px] sm:flex-none" disabled={busy} onClick={() => void bulk("reject")} aria-label="Reject the rest">Reject rest</button>
            </div>
          ) : null}

          <ReviewQueue items={queue} onReview={(id, a) => void review(id, a)} onEdit={(id, e) => void edit(id, e)} busyIds={busyIds} />

          <Card className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1 text-[13px] text-text-muted">
              <p className="font-semibold text-text-primary">Raw uploads</p>
              <p>{data.raw.files ? `${data.raw.files} file${data.raw.files === 1 ? "" : "s"} · ${kb(data.raw.bytes)} in DATA_DIR/imports/raw` : "None kept."} Deleting them keeps the queue and your persona.</p>
            </div>
            {data.raw.files ? <button type="button" className="btn-ghost text-danger" disabled={busy} onClick={() => void deleteRaw()}><Trash2 size={16} aria-hidden="true" />Delete raw files</button> : null}
          </Card>
          {data.batches.length ? (
            <p className="text-[12px] text-text-subtle">
              Recent: {data.batches.slice(0, 4).map((b) => `${sourceInfo(b.source).label} (${b.candidates}, ${b.mode}${b.provider ? ` · ${b.provider}` : ""})`).join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </PageShell>
  );
}

function recount(queue: Candidate[]) {
  const by = { pending: 0, approved: 0, rejected: 0 };
  for (const c of queue) by[c.status]++;
  return { total: queue.length, ...by };
}

function Stepper({ step, canReview, onGo }: { step: Step; canReview: boolean; onGo: (s: Step) => void }) {
  const steps: { id: Step; label: string; short: string }[] = [{ id: "source", label: "Source", short: "Source" }, { id: "add", label: "Add & extract", short: "Add" }, { id: "review", label: "Review", short: "Review" }];
  return (
    <ol className="mb-4 grid grid-cols-3 gap-1.5" aria-label="Import steps">
      {steps.map((s, i) => {
        const active = step === s.id;
        const disabled = s.id === "review" && !canReview;
        return (
          <li key={s.id}>
            <button type="button" onClick={() => onGo(s.id)} disabled={disabled} aria-current={active ? "step" : undefined} className={cn("touch-target flex w-full items-center justify-center gap-1.5 rounded-control border px-2 text-[12px] font-semibold sm:text-[13px]", active ? "border-accent/60 bg-accent/15 text-text-primary" : "border-subtle bg-surface text-text-muted", disabled && "opacity-40")}>
              <span className={cn("inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px]", active ? "bg-accent text-white" : "bg-surface-2")}>{i + 1}</span>
              <span className="sm:hidden">{s.short}</span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function ModeButton({ active, onClick, label, hint, disabled, warn }: { active: boolean; onClick: () => void; label: string; hint: string; disabled?: boolean; warn?: boolean }) {
  return (
    <button type="button" role="radio" aria-checked={active} disabled={disabled} onClick={onClick}
      className={cn("touch-target w-full rounded-control border px-2 py-1.5 text-left", active ? (warn ? "border-warning/60 bg-warning/10 text-text-primary" : "border-accent/60 bg-accent/15 text-text-primary") : "border-strong bg-surface-2 text-text-muted hover:text-text-primary", disabled && "opacity-40")}>
      <span className="block text-[12px] font-semibold leading-tight sm:text-[13px]">{label}</span>
      <span className="block truncate text-[10px] text-text-subtle">{hint}</span>
    </button>
  );
}
