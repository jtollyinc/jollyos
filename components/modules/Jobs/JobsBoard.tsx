"use client";

/**
 * components/modules/Jobs/JobsBoard — one list, a filter strip, a new-job
 * sheet with the runner picker, and a card drawer. ADHD rules: the first fold
 * says what needs you (Blocked + Failed, amber), nothing is hidden by a filter
 * you did not pick, every disabled control says why. Polls while anything runs.
 */
import { Ban, Bot, Inbox, Lock, Play, Plus, RotateCcw, Search, Trash2, Unlock } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Chip, EmptyState, Notice, PageHeader, PageShell, Prose } from "@/components/jolly/Foundation";
import { SideDrawer } from "@/components/jolly/SideDrawer";
import { briefIsPrivate, costLabel, jobCounts, runnerManifest, type Job, type JobLane, type RunnerChoice, type RunnerId } from "@/lib/jobs/types";
import { ago, cn } from "@/lib/utils";
import { RunnerPicker, type RunnerInfo } from "./RunnerPicker";

interface BoardResponse { jobs: Job[]; counts: Record<JobLane, number>; runners: RunnerInfo[]; defaultRunner: RunnerId }
type Filter = "all" | "needs-you" | "running" | "inbox" | "blocked" | "done" | "failed";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" }, { id: "needs-you", label: "Needs you" }, { id: "running", label: "Running" },
  { id: "inbox", label: "Inbox" }, { id: "blocked", label: "Blocked" }, { id: "done", label: "Done" }, { id: "failed", label: "Failed" },
];
const needsYou = (j: Job) => j.lane === "blocked" || j.lane === "failed";
function matches(j: Job, f: Filter): boolean {
  if (f === "all") return true;
  if (f === "needs-you") return needsYou(j);
  return j.lane === f;
}

export function JobsBoard() {
  const [data, setData] = useState<BoardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [text, setText] = useState("");
  const [runner, setRunner] = useState<RunnerChoice>("auto");
  const [privateJob, setPrivateJob] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      fetch("/api/jobs", { cache: "no-store" })
        .then((res) => (res.ok ? (res.json() as Promise<BoardResponse>) : Promise.reject(new Error(String(res.status)))))
        .then((board) => { setData(board); setError(null); })
        .catch(() => setError("Could not load the board.")),
    [],
  );
  useEffect(() => { void load(); }, [load]);
  const running = data?.jobs.some((j) => j.lane === "running") ?? false;
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => void load(), 1500);
    return () => window.clearInterval(id);
  }, [running, load]);

  const jobs = useMemo(() => data?.jobs ?? [], [data]);
  const counts = useMemo(() => jobCounts(jobs), [jobs]);
  const q = query.trim().toLowerCase();
  const visible = jobs.filter((j) => matches(j, filter) && (!q || `${j.title} ${j.brief} ${j.output ?? ""}`.toLowerCase().includes(q)));
  const attention = jobs.filter(needsYou);
  const open = openId ? jobs.find((j) => j.id === openId) ?? null : null;
  const isPrivate = privateJob || briefIsPrivate(text);

  async function act(url: string, init: RequestInit): Promise<{ ok: boolean; error?: string }> {
    setError(null);
    try {
      const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setError(body.error ?? `That did not work (${res.status}).`); return { ok: false, error: body.error }; }
      return { ok: true };
    } catch { setError("Network error — nothing changed."); return { ok: false }; }
    finally { await load(); }
  }
  async function submit(run: boolean) {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    const r = await act("/api/jobs", { method: "POST", body: JSON.stringify({ text: body, private: isPrivate, runner, run }) });
    setBusy(false);
    if (r.ok) { setText(""); setPrivateJob(false); setShowNew(false); }
  }
  const runJob = (job: Job, choice: RunnerChoice) => act(`/api/jobs/${job.id}/run`, { method: "POST", body: JSON.stringify({ runner: choice }) });
  const move = (job: Job, lane: JobLane) => act(`/api/jobs/${job.id}`, { method: "PATCH", body: JSON.stringify({ lane }) });
  const remove = async (job: Job) => { setOpenId(null); await act(`/api/jobs/${job.id}`, { method: "DELETE" }); };

  return (
    <PageShell>
      <PageHeader title="Jobs" lede="Capture a card, pick who runs it, watch it move.">
        <button type="button" className="btn-primary" onClick={() => setShowNew((v) => !v)} aria-expanded={showNew}><Plus size={16} aria-hidden="true" />New job</button>
        {attention.length ? (
          <button type="button" onClick={() => { setFilter("needs-you"); setOpenId(attention[0].id); }} className="touch-target inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-3 text-xs font-semibold text-warning">
            {attention.length} need{attention.length === 1 ? "s" : ""} you
          </button>
        ) : null}
      </PageHeader>

      {showNew ? (
        <Card className="mb-4 border-accent/25 p-4 sm:p-5">
          <h2 className="mb-2 text-sm font-semibold">New job</h2>
          <label className="sr-only" htmlFor="new-job-text">Brief</label>
          <textarea id="new-job-text" className="field min-h-[96px] resize-y font-mono text-[13px]" rows={4} value={text} autoFocus
            placeholder="First line is the title; the rest is the brief. ⌘/Ctrl+Enter runs it."
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void submit(true); } }} />
          <div className="mt-3">
            <RunnerPicker value={runner} onChange={setRunner} isPrivate={isPrivate} onPrivate={setPrivateJob} lockDisabled={!privateJob && briefIsPrivate(text)} runners={data?.runners ?? null} defaultRunner={data?.defaultRunner ?? "demo"} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className="btn-primary" disabled={busy || !text.trim()} onClick={() => void submit(true)}><Play size={16} aria-hidden="true" />{busy ? "Starting…" : "Run now"}</button>
            <button type="button" className="btn-ghost" disabled={busy || !text.trim()} onClick={() => void submit(false)}><Inbox size={16} aria-hidden="true" />Save to inbox</button>
            <button type="button" className="btn-quiet" onClick={() => setShowNew(false)}>Cancel</button>
          </div>
        </Card>
      ) : null}
      {error ? <Notice tone="danger" className="mb-4">{error}</Notice> : null}

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => {
          const n = f.id === "all" ? jobs.length : f.id === "needs-you" ? attention.length : counts[f.id];
          if (n === 0 && f.id !== "all" && filter !== f.id) return null;
          return (
            <button key={f.id} type="button" onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}
              className={cn("touch-target rounded-full border px-3 text-[12px]", filter === f.id ? "border-accent/50 bg-accent/15 text-accent-soft" : "border-subtle text-text-muted hover:text-text-primary", f.id === "needs-you" && n > 0 && filter !== f.id && "border-warning/40 text-warning")}>
              {f.label} <span className="tabular-nums opacity-70">{n}</span>
            </button>
          );
        })}
      </div>
      <label className="relative mb-3 block">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle" aria-hidden="true" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, brief, output…" aria-label="Search jobs" className="field pl-9" />
      </label>

      {data && visible.length === 0 ? (
        <EmptyState title={jobs.length === 0 ? "Nothing on the board" : "Nothing matches this filter"}>{jobs.length === 0 ? "Capture a thought with New job. The first line becomes the title." : null}</EmptyState>
      ) : (
        <ul className="space-y-2">
          {visible.map((job) => <li key={job.id}><JobRow job={job} active={openId === job.id} onOpen={() => setOpenId(job.id)} /></li>)}
        </ul>
      )}

      <SideDrawer open={open !== null} onClose={() => setOpenId(null)} title={open?.title ?? "Job"}>
        {open ? (
          <JobDrawer job={open} runners={data?.runners ?? null} defaultRunner={data?.defaultRunner ?? "demo"}
            onRun={(c) => void runJob(open, c)} onMove={(lane) => void move(open, lane)} onDelete={() => void remove(open)} />
        ) : null}
      </SideDrawer>
    </PageShell>
  );
}

function LaneChip({ job }: { job: Job }) {
  if (job.lane === "failed") return <Chip tone="danger">failed</Chip>;
  if (job.lane === "blocked") return <Chip tone="warning">blocked</Chip>;
  if (job.lane === "running") return <Chip tone="info">running · {job.progress}%</Chip>;
  if (job.lane === "done") return <Chip tone="success">done</Chip>;
  return <Chip>inbox</Chip>;
}

function RunnerChips({ job }: { job: Job }) {
  const m = runnerManifest(job.runner);
  const cost = costLabel(job.runner);
  return (
    <>
      {job.private ? <Chip tone="success" icon={Lock}>private</Chip> : null}
      {m ? <Chip tone={m.kind === "local" ? "success" : "accent"} icon={Bot}>{m.label}{cost ? ` · ${cost}` : ""}</Chip> : null}
    </>
  );
}

function JobRow({ job, active, onOpen }: { job: Job; active: boolean; onOpen: () => void }) {
  return (
    <Card className={cn("p-3 sm:p-4", needsYou(job) && "border-warning/40", active && "border-accent/50")}>
      <button type="button" onClick={onOpen} className="block w-full min-h-11 text-left" aria-current={active ? "true" : undefined}>
        <span className="flex flex-wrap items-center gap-1.5">
          <LaneChip job={job} />
          <RunnerChips job={job} />
          <span className="ml-auto text-[12px] tabular-nums text-text-subtle">{ago(job.finishedAt ?? job.startedAt ?? job.createdAt)}</span>
        </span>
        <span className="mt-1.5 block text-sm font-semibold leading-snug">{job.title}</span>
        {job.brief ? <span className="mt-0.5 line-clamp-2 block text-[13px] text-text-muted">{job.brief}</span> : null}
        {job.lane === "blocked" && job.blockedReason ? <span className="mt-1 block text-[12px] text-warning">{job.blockedReason}</span> : null}
        {job.lane === "failed" && job.error ? <span className="mt-1 block text-[12px] text-danger">{job.error}</span> : null}
      </button>
      {job.lane === "running" ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={job.progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${job.progress}%` }} />
        </div>
      ) : null}
    </Card>
  );
}

function JobDrawer({ job, runners, defaultRunner, onRun, onMove, onDelete }: { job: Job; runners: RunnerInfo[] | null; defaultRunner: RunnerId; onRun: (c: RunnerChoice) => void; onMove: (lane: JobLane) => void; onDelete: () => void }) {
  const [choice, setChoice] = useState<RunnerChoice>("auto");
  const canRun = job.lane !== "running";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <LaneChip job={job} />
        <RunnerChips job={job} />
        <span className="text-[13px] text-text-muted">captured {ago(job.createdAt)}{job.model ? ` · ${job.model}` : ""}</span>
      </div>
      {job.lane === "blocked" ? (
        <Notice tone="warning">
          <span className="font-semibold">Needs you.</span> {job.blockedReason ?? "Blocked."}
          {job.private ? " This card is private, so it waits for your local model instead of going anywhere else." : ""}
        </Notice>
      ) : null}
      {job.error ? <Notice tone="danger">{job.error}</Notice> : null}
      {job.brief ? <Prose text={job.brief} className="text-text-muted" /> : <p className="text-sm text-text-subtle">No brief — just a title.</p>}
      {job.output ? (
        <section>
          <h3 className="mb-1 text-label font-bold uppercase tracking-widest text-text-subtle">Output</h3>
          <Card className="p-4"><Prose text={job.output} /></Card>
        </section>
      ) : null}
      {canRun ? (
        <section className="space-y-2">
          <RunnerPicker value={choice} onChange={setChoice} isPrivate={job.private} runners={runners} defaultRunner={defaultRunner} />
          <button type="button" className="btn-primary" onClick={() => onRun(choice)}>
            {job.lane === "inbox" ? <Play size={16} aria-hidden="true" /> : <RotateCcw size={16} aria-hidden="true" />}
            {job.lane === "inbox" ? "Run" : job.lane === "blocked" ? "Try again" : "Run again"}
          </button>
        </section>
      ) : null}
      <section>
        <h3 className="mb-1 text-label font-bold uppercase tracking-widest text-text-subtle">Log</h3>
        <ul className="space-y-1 text-[13px] text-text-muted">
          {job.log.slice(-12).map((l, i) => <li key={i}><span className="tabular-nums text-text-subtle">{ago(l.at)}</span> · {l.line}</li>)}
        </ul>
      </section>
      <div className="flex flex-wrap gap-2 border-t border-subtle pt-4">
        {job.lane === "blocked" ? <button type="button" className="btn-ghost" onClick={() => onMove("inbox")}><Unlock size={16} aria-hidden="true" />Unblock</button> : null}
        {job.lane !== "inbox" && job.lane !== "blocked" && job.lane !== "running" ? <button type="button" className="btn-ghost" onClick={() => onMove("inbox")}><RotateCcw size={16} aria-hidden="true" />Back to inbox</button> : null}
        {job.lane === "inbox" ? <button type="button" className="btn-ghost" onClick={() => onMove("done")}>Mark done</button> : null}
        {job.lane === "running" ? <span className="inline-flex items-center gap-1 text-[13px] text-text-subtle"><Ban size={14} aria-hidden="true" /> Running — wait for it to finish</span> : null}
        <button type="button" className="btn-quiet text-danger" onClick={onDelete}><Trash2 size={16} aria-hidden="true" />Delete</button>
      </div>
    </div>
  );
}
