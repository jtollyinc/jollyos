"use client";

/**
 * components/modules/Goals/GoalsPanel — the Coach page.
 * ────────────────────────────────────────────────────────────────────────────
 * Per goal: the one next small step (loud), the reality check (blunt, with its
 * receipts folded away), progress from the check-ins, and the two-minute
 * weekly check-in form.
 *
 * The verdict is always the rule-based one from lib/goals/reality. When a model
 * rewrote the wording the card says so, because "a model said this about your
 * life" and "arithmetic said this about your life" are different claims.
 */
import { ArrowRight, CalendarCheck, Check, ChevronDown, Lock, Plus, Target } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { Card, Chip, EmptyState, Notice, PageHeader, PageShell } from "@/components/jolly/Foundation";
import { HELP } from "@/lib/help";
import type { CoachedCheck } from "@/lib/goals/coach";
import { DID_LABELS, OBSTACLES, areaById, weekKey, type CheckIn, type DidIt, type Goal } from "@/lib/goals/types";
import { ago } from "@/lib/utils";

interface Payload {
  goals: Goal[];
  checkIns: CheckIn[];
  checks: CoachedCheck[];
}

const VERDICT_TONE = { "on-track": "success", slipping: "warning", stalled: "danger", "too-new": "info" } as const;
const VERDICT_LABEL = { "on-track": "On track", slipping: "Slipping", stalled: "Stalled", "too-new": "Too new to judge" } as const;

export function GoalsPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openCheckIn, setOpenCheckIn] = useState<string | null>(null);

  const load = useCallback(
    () =>
      fetch("/api/goals", { cache: "no-store" })
        .then((res) => (res.ok ? (res.json() as Promise<Payload>) : Promise.reject(new Error(String(res.status)))))
        .then((json) => { setData(json); setError(null); })
        .catch(() => setError("Could not load your goals.")),
    [],
  );
  useEffect(() => { void load(); }, [load]);

  const goals = data?.goals ?? [];

  return (
    <PageShell width="narrow">
      <PageHeader title="Goals" help={HELP.goals}>
        <Link href="/goals/new" className="btn-primary"><Plus size={16} aria-hidden="true" />New goal</Link>
      </PageHeader>

      {error ? <Notice tone="danger" className="mb-4">{error}</Notice> : null}

      {data && goals.length === 0 ? (
        <EmptyState
          title="No goals yet"
          action={<Link href="/goals/new" className="btn-primary">Set your first goal<ArrowRight size={14} aria-hidden="true" /></Link>}
        >
          A goal here is not a wish: it records what you want, where you honestly are today, and the hours you can really give it. A week later you check in, and this page tells you the difference between the two.
        </EmptyState>
      ) : null}

      <div className="space-y-3">
        {goals.map((goal) => {
          const check = data!.checks.find((c) => c.goalId === goal.id);
          const mine = data!.checkIns.filter((c) => c.goalId === goal.id);
          return (
            <GoalCard
              key={goal.id}
              goal={goal}
              check={check}
              checkIns={mine}
              open={openCheckIn === goal.id}
              onToggleCheckIn={() => setOpenCheckIn((id) => (id === goal.id ? null : goal.id))}
              onSaved={() => { setOpenCheckIn(null); void load(); }}
            />
          );
        })}
      </div>

      {!data && !error ? <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="h-40 animate-pulse rounded-card bg-surface" />)}</div> : null}
    </PageShell>
  );
}

function GoalCard({ goal, check, checkIns, open, onToggleCheckIn, onSaved }: {
  goal: Goal;
  check?: CoachedCheck;
  checkIns: CheckIn[];
  open: boolean;
  onToggleCheckIn: () => void;
  onSaved: () => void;
}) {
  const [showFacts, setShowFacts] = useState(false);
  const factsId = useId();
  const area = areaById(goal.area);
  const thisWeek = checkIns.some((c) => c.week === weekKey());
  const pct = check?.stats.progressPct ?? null;

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Chip tone="neutral">{area?.label ?? goal.area}</Chip>
        {goal.privacy === "local-only" ? <Chip tone="info" icon={Lock}>local only</Chip> : null}
        {check ? <Chip tone={VERDICT_TONE[check.verdict]}>{VERDICT_LABEL[check.verdict]}</Chip> : null}
        {thisWeek ? <Chip tone="success" icon={Check}>checked in</Chip> : null}
      </div>

      <h2 className="text-base font-semibold leading-snug">{goal.want}</h2>
      {goal.why ? <p className="mt-0.5 text-[13px] text-text-muted">Because: {goal.why}</p> : null}

      {pct !== null ? (
        <div className="mt-3">
          <div className="mb-1 flex items-baseline justify-between text-[12px] text-text-muted">
            <span>{check!.stats.firstValue ?? goal.baseline} → {check!.stats.latestValue} {goal.unit}</span>
            <span className="tabular-nums">{pct}% of {goal.target}</span>
          </div>
          <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Progress towards ${goal.want}`} className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : null}

      {check ? (
        <>
          <div className="mt-3 rounded-control border border-subtle bg-surface-2/40 p-3">
            <p className="text-label font-bold uppercase tracking-wider text-text-subtle">Next step</p>
            <p className="mt-0.5 text-sm font-semibold">{goal.nextStep || check.adjustmentText}</p>
          </div>

          <div className="mt-3">
            <p className="text-label font-bold uppercase tracking-wider text-text-subtle">Reality check</p>
            <p className="mt-1 text-sm leading-relaxed">{check.headlineText}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-accent-soft">{check.adjustmentText}</p>
            {check.note ? <p className="mt-1.5 text-[12px] text-text-subtle">{check.note}</p> : null}
            <p className="mt-1.5 text-[12px] text-text-subtle">
              {check.voice === "model" ? `Worked out from your check-ins; wording by ${check.provider}.` : "Worked out from your check-ins. No model involved."}
            </p>
            {check.facts.length ? (
              <>
                <button type="button" className="btn-quiet mt-1 !min-h-10 text-[13px]" aria-expanded={showFacts} aria-controls={factsId} onClick={() => setShowFacts((v) => !v)}>
                  <ChevronDown size={14} className={showFacts ? "" : "-rotate-90"} aria-hidden="true" />
                  {showFacts ? "Hide" : "Show"} the numbers
                </button>
                <ul id={factsId} hidden={!showFacts} className="mt-1 space-y-1 text-[13px] text-text-muted">
                  {check.facts.map((f) => <li key={f}>{f}</li>)}
                </ul>
              </>
            ) : null}
          </div>
        </>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={thisWeek ? "btn-ghost" : "btn-primary"} onClick={onToggleCheckIn} aria-expanded={open}>
          <CalendarCheck size={16} aria-hidden="true" />
          {thisWeek ? "Check in again" : "Weekly check-in"}
        </button>
        <span className="text-[12px] text-text-subtle">
          {checkIns.length ? `${checkIns.length} check-in${checkIns.length === 1 ? "" : "s"} · last ${ago(checkIns[checkIns.length - 1].at)}` : "No check-ins yet"}
        </span>
      </div>

      {open ? <CheckInForm goal={goal} onSaved={onSaved} /> : null}
    </Card>
  );
}

/** Two minutes: did you, how far, how long, what got in the way. */
function CheckInForm({ goal, onSaved }: { goal: Goal; onSaved: () => void }) {
  const [did, setDid] = useState<DidIt>("partly");
  const [value, setValue] = useState("");
  const [hours, setHours] = useState("");
  const [blockers, setBlockers] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/goals/${goal.id}/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          did,
          value: value.trim() === "" ? null : Number(value),
          hoursActual: hours.trim() === "" ? 0 : Number(hours),
          blockers,
          note,
        }),
      });
      if (!res.ok) { setError("That did not save."); return; }
      onSaved();
    } catch {
      setError("The server did not answer.");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id: string) => setBlockers((b) => (b.includes(id) ? b.filter((x) => x !== id) : [...b, id]));

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-control border border-subtle bg-surface-2/40 p-3">
      <fieldset>
        <legend className="text-label font-bold uppercase tracking-wider text-text-subtle">Did you do it this week?</legend>
        <div className="mt-1.5 flex gap-1.5">
          {(Object.keys(DID_LABELS) as DidIt[]).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={did === d}
              onClick={() => setDid(d)}
              className={`touch-target flex-1 rounded-control border px-3 text-sm font-semibold ${did === d ? "border-accent bg-accent/15 text-accent-soft" : "border-strong bg-surface-2 text-text-muted"}`}
            >
              {DID_LABELS[d]}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="block text-label font-bold uppercase tracking-wider text-text-subtle">Where are you now{goal.unit ? ` (${goal.unit})` : ""}</span>
          <input className="field mt-1" type="number" inputMode="decimal" step="any" value={value} onChange={(e) => setValue(e.target.value)} placeholder={goal.baseline === null ? "" : String(goal.baseline)} />
        </label>
        <label className="min-w-0 flex-1">
          <span className="block text-label font-bold uppercase tracking-wider text-text-subtle">Hours spent</span>
          <input className="field mt-1" type="number" inputMode="decimal" step="any" min={0} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="0" />
        </label>
      </div>

      <fieldset>
        <legend className="text-label font-bold uppercase tracking-wider text-text-subtle">What got in the way?</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {OBSTACLES.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={blockers.includes(o.id)}
              onClick={() => toggle(o.id)}
              className={`inline-flex min-h-11 items-center rounded-full border px-3 text-[13px] font-semibold ${blockers.includes(o.id) ? "border-accent bg-accent/15 text-accent-soft" : "border-strong bg-surface-2 text-text-muted"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="block text-label font-bold uppercase tracking-wider text-text-subtle">Anything to remember?</span>
        <input className="field mt-1" value={note} onChange={(e) => setNote(e.target.value)} maxLength={400} placeholder="Optional" />
      </label>

      {error ? <Notice tone="danger">{error}</Notice> : null}
      <button type="submit" className="btn-primary w-full" disabled={busy}>
        <Target size={16} aria-hidden="true" />
        {busy ? "Saving…" : "Save check-in"}
      </button>
    </form>
  );
}
