"use client";

/**
 * components/modules/Jobs/JobsBoard — three lanes, one capture box, a runner
 * picker per card. Polls while anything is running so the demo runner's
 * elapsed-time progress is visible. Failed cards sit in Done with a red mark
 * (an obligation is never hidden by a filter).
 */
import { Bot, Play, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Card, Chip, EmptyState, Notice, PageHeader, PageShell, Prose } from "@/components/jolly/Foundation";
import { SideDrawer } from "@/components/jolly/SideDrawer";
import { LANES, type Job, type JobLane } from "@/lib/jobs/types";
import { ago, cn } from "@/lib/utils";
import { CaptureBox } from "./CaptureBox";

interface RunnerInfo { id: string; label: string; description: string }
interface BoardResponse { jobs: Job[]; counts: Record<JobLane, number>; runners: RunnerInfo[] }

export function JobsBoard() {
  const [data, setData] = useState<BoardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Job | null>(null);
  const [runner, setRunner] = useState("demo");

  // State is only set inside promise callbacks, never synchronously in an effect.
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

  async function run(job: Job) {
    setError(null);
    const res = await fetch(`/api/jobs/${job.id}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runner }) });
    if (!res.ok) setError(((await res.json()) as { error?: string }).error ?? "Could not start that job.");
    await load();
  }

  async function move(job: Job, lane: JobLane) {
    await fetch(`/api/jobs/${job.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lane }) });
    await load();
  }

  async function remove(job: Job) {
    await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
    setOpen(null);
    await load();
  }

  const laneJobs = (lane: JobLane) => (data?.jobs ?? []).filter((j) => (lane === "done" ? j.lane === "done" || j.lane === "failed" : j.lane === lane));

  return (
    <PageShell>
      <PageHeader title="Jobs" lede="Capture a thought as a card. Pick a runner. Watch it move.">
        <label className="flex items-center gap-2 text-sm text-text-muted">
          Runner
          <select className="field min-w-[9rem]" value={runner} onChange={(e) => setRunner(e.target.value)} aria-label="Runner">
            {(data?.runners ?? [{ id: "demo", label: "Demo runner", description: "" }]).map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>
      </PageHeader>

      <Card className="mb-4 p-4"><CaptureBox onCaptured={() => void load()} /></Card>
      {error ? <Notice tone="danger" className="mb-4">{error}</Notice> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {LANES.map((lane) => {
          const jobs = laneJobs(lane.id);
          return (
            <section key={lane.id} aria-labelledby={`lane-${lane.id}`} className="min-w-0">
              <h2 id={`lane-${lane.id}`} className="mb-2 flex items-center gap-2 px-1 text-label font-bold uppercase tracking-widest text-text-subtle">
                {lane.label}
                <span className="rounded-full bg-surface-2 px-2 py-0.5 tabular-nums">{jobs.length}</span>
              </h2>
              <div className="space-y-2">
                {jobs.length === 0 ? (
                  <EmptyState title={lane.id === "inbox" ? "Inbox is clear" : lane.id === "running" ? "Nothing running" : "Nothing finished yet"} />
                ) : jobs.map((job) => (
                  <JobCard key={job.id} job={job} onOpen={() => setOpen(job)} onRun={() => void run(job)} />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <SideDrawer open={open !== null} onClose={() => setOpen(null)} title={open?.title ?? "Job"}>
        {open ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <LaneChip job={open} />
              <span className="text-[13px] text-text-muted">captured {ago(open.createdAt)}</span>
              {open.runner ? <Chip tone="accent" icon={Bot}>{open.runner} runner</Chip> : null}
            </div>
            {open.brief ? <Prose text={open.brief} className="text-text-muted" /> : <p className="text-sm text-text-subtle">No brief — just a title.</p>}
            {open.error ? <Notice tone="danger">{open.error}</Notice> : null}
            {open.output ? (
              <section>
                <h3 className="mb-1 text-label font-bold uppercase tracking-widest text-text-subtle">Output</h3>
                <Card className="p-4"><Prose text={open.output} /></Card>
              </section>
            ) : null}
            <section>
              <h3 className="mb-1 text-label font-bold uppercase tracking-widest text-text-subtle">Log</h3>
              <ul className="space-y-1 text-[13px] text-text-muted">
                {open.log.map((l, i) => <li key={i}><span className="tabular-nums text-text-subtle">{ago(l.at)}</span> · {l.line}</li>)}
              </ul>
            </section>
            <div className="flex flex-wrap gap-2 border-t border-subtle pt-4">
              {open.lane !== "running" ? <button type="button" className="btn-primary" onClick={() => { void run(open); setOpen(null); }}><Play size={16} aria-hidden="true" />Run with {runner}</button> : null}
              {open.lane !== "inbox" ? <button type="button" className="btn-ghost" onClick={() => { void move(open, "inbox"); setOpen(null); }}><RotateCcw size={16} aria-hidden="true" />Back to inbox</button> : null}
              {open.lane === "inbox" ? <button type="button" className="btn-ghost" onClick={() => { void move(open, "done"); setOpen(null); }}>Mark done</button> : null}
              <button type="button" className="btn-quiet text-danger" onClick={() => void remove(open)}><Trash2 size={16} aria-hidden="true" />Delete</button>
            </div>
          </div>
        ) : null}
      </SideDrawer>
    </PageShell>
  );
}

function LaneChip({ job }: { job: Job }) {
  if (job.lane === "failed") return <Chip tone="danger">failed</Chip>;
  if (job.lane === "running") return <Chip tone="info">running · {job.progress}%</Chip>;
  if (job.lane === "done") return <Chip tone="success">done</Chip>;
  return <Chip>inbox</Chip>;
}

function JobCard({ job, onOpen, onRun }: { job: Job; onOpen: () => void; onRun: () => void }) {
  return (
    <Card className={cn("p-3 sm:p-4", job.lane === "failed" && "border-danger/40")}>
      <button type="button" onClick={onOpen} className="block w-full min-h-11 text-left">
        <span className="block text-sm font-semibold leading-snug">{job.title}</span>
        {job.brief ? <span className="mt-1 line-clamp-2 block text-[13px] text-text-muted">{job.brief}</span> : null}
      </button>
      {job.lane === "running" ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={job.progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${job.progress}%` }} />
        </div>
      ) : null}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><LaneChip job={job} /><span className="text-[12px] text-text-subtle">{ago(job.finishedAt ?? job.startedAt ?? job.createdAt)}</span></div>
        {job.lane === "inbox" ? <button type="button" className="btn-ghost px-3 text-[13px]" onClick={onRun}><Play size={14} aria-hidden="true" />Run</button> : null}
      </div>
    </Card>
  );
}
