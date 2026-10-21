"use client";

/**
 * components/modules/Goals/NewGoalForm — one goal, five honest questions.
 * The same five the walkthrough asks, so there is one definition of a goal.
 */
import { ArrowLeft, Target } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, Chip, Notice, PageHeader, PageShell } from "@/components/jolly/Foundation";
import { GOAL_AREAS, OBSTACLES, areaById, type GoalAreaId } from "@/lib/goals/types";
import { HELP } from "@/lib/help";

export function NewGoalForm({ protectedAreas }: { protectedAreas: string[] }) {
  const router = useRouter();
  const [area, setArea] = useState<GoalAreaId | null>(null);
  const [want, setWant] = useState("");
  const [why, setWhy] = useState("");
  const [baselineNote, setBaselineNote] = useState("");
  const [baseline, setBaseline] = useState("");
  const [target, setTarget] = useState("");
  const [obstacles, setObstacles] = useState<string[]>([]);
  const [hours, setHours] = useState("2");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = area ? areaById(area) : null;
  const willBePrivate = Boolean(chosen?.sensitive && protectedAreas.includes(chosen.sensitive));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!area || !want.trim()) { setError("Pick a life area and say what you want."); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          area, want, why, baselineNote,
          baseline: baseline.trim() === "" ? null : Number(baseline),
          target: target.trim() === "" ? null : Number(target),
          unit: chosen?.unit ?? "",
          obstacles,
          hoursClaimed: hours.trim() === "" ? 0 : Number(hours),
        }),
      });
      if (!res.ok) { setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not save that."); return; }
      router.push("/goals");
      router.refresh();
    } catch {
      setError("The server did not answer.");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id: string) => setObstacles((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));

  return (
    <PageShell width="narrow">
      <PageHeader title="New goal" help={HELP.goals}>
        <Link href="/goals" className="btn-ghost"><ArrowLeft size={14} aria-hidden="true" />Goals</Link>
      </PageHeader>
      <Card className="p-4 sm:p-5">
        <form onSubmit={submit} className="space-y-4">
          <fieldset>
            <legend className="text-label font-bold uppercase tracking-wider text-text-subtle">Which part of your life?</legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {GOAL_AREAS.map((a) => (
                <button key={a.id} type="button" aria-pressed={area === a.id} onClick={() => setArea(a.id)}
                  className={`inline-flex min-h-11 items-center rounded-full border px-3 text-[13px] font-semibold ${area === a.id ? "border-accent bg-accent/15 text-accent-soft" : "border-strong bg-surface-2 text-text-muted"}`}>
                  {a.label}
                </button>
              ))}
            </div>
            {chosen ? <p className="mt-1.5 text-[12px] text-text-muted">{chosen.hint}</p> : null}
            {willBePrivate ? <p className="mt-1.5 text-[12px] text-info">This area is on your local-only list, so this goal never goes to a hosted model.</p> : null}
          </fieldset>

          <label className="block">
            <span className="block text-label font-bold uppercase tracking-wider text-text-subtle">What exactly do you want?</span>
            <input className="field mt-1" value={want} onChange={(e) => setWant(e.target.value)} maxLength={160} placeholder={chosen?.example ?? "Be specific enough to know when it is done"} />
          </label>
          <label className="block">
            <span className="block text-label font-bold uppercase tracking-wider text-text-subtle">Why does it matter?</span>
            <input className="field mt-1" value={why} onChange={(e) => setWhy(e.target.value)} maxLength={300} placeholder="The reason that survives a bad week" />
          </label>
          <label className="block">
            <span className="block text-label font-bold uppercase tracking-wider text-text-subtle">Where are you honestly today?</span>
            <input className="field mt-1" value={baselineNote} onChange={(e) => setBaselineNote(e.target.value)} maxLength={300} placeholder="Plain words are fine" />
          </label>
          <div className="flex gap-2">
            <label className="min-w-0 flex-1">
              <span className="block text-label font-bold uppercase tracking-wider text-text-subtle">Today{chosen?.unit ? ` (${chosen.unit})` : ""}</span>
              <input className="field mt-1" type="number" inputMode="decimal" step="any" value={baseline} onChange={(e) => setBaseline(e.target.value)} placeholder="optional" />
            </label>
            <label className="min-w-0 flex-1">
              <span className="block text-label font-bold uppercase tracking-wider text-text-subtle">Target</span>
              <input className="field mt-1" type="number" inputMode="decimal" step="any" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="optional" />
            </label>
          </div>

          <fieldset>
            <legend className="text-label font-bold uppercase tracking-wider text-text-subtle">What usually stops you?</legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {OBSTACLES.map((o) => (
                <button key={o.id} type="button" aria-pressed={obstacles.includes(o.id)} onClick={() => toggle(o.id)}
                  className={`inline-flex min-h-11 items-center rounded-full border px-3 text-[13px] font-semibold ${obstacles.includes(o.id) ? "border-accent bg-accent/15 text-accent-soft" : "border-strong bg-surface-2 text-text-muted"}`}>
                  {o.label}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="block text-label font-bold uppercase tracking-wider text-text-subtle">Hours a week you can really give it</span>
            <span className="mt-0.5 block text-[12px] text-text-muted">Be honest, not ambitious. This is the number the Coach checks you against.</span>
            <input className="field mt-1" type="number" inputMode="decimal" step="0.5" min={0} max={80} value={hours} onChange={(e) => setHours(e.target.value)} />
          </label>

          {error ? <Notice tone="danger">{error}</Notice> : null}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            <Target size={16} aria-hidden="true" />
            {busy ? "Saving…" : "Save goal"}
          </button>
          {willBePrivate ? <Chip tone="info">stored local-only</Chip> : null}
        </form>
      </Card>
    </PageShell>
  );
}
