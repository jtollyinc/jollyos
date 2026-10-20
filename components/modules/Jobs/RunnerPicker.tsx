"use client";

/**
 * components/modules/Jobs/RunnerPicker — the ONE runner control: Auto plus
 * each registered runner, and the Private lock. 44px targets, a three-column
 * grid on phones. The hint line says what Auto resolves to, the cost class and
 * the runner's health; a private job shows Local forced and the rest dimmed.
 * Shared by the new-job sheet and the card drawer so there is one picker, not two.
 */
import { Lock, LockOpen } from "lucide-react";
import { resolveRunner, RUNNER_MANIFESTS, type RunnerChoice, type RunnerId, type RunnerManifest } from "@/lib/jobs/types";
import { cn } from "@/lib/utils";

export type RunnerHealthInfo = { ok: boolean; status: "ready" | "needs-setup" | "unreachable"; detail: string; model: string | null };
export type RunnerInfo = RunnerManifest & { health: RunnerHealthInfo | null };

export function RunnerPicker({ value, onChange, isPrivate, onPrivate, runners, defaultRunner, lockDisabled = false }: {
  value: RunnerChoice; onChange: (c: RunnerChoice) => void;
  isPrivate: boolean; onPrivate?: (v: boolean) => void;
  runners: RunnerInfo[] | null; defaultRunner: RunnerId; lockDisabled?: boolean;
}) {
  const info = (id: RunnerId): RunnerInfo => runners?.find((r) => r.id === id) ?? { ...RUNNER_MANIFESTS.find((m) => m.id === id)!, health: null };
  const resolved = resolveRunner(value, { private: isPrivate, defaultRunner });
  const effective = info(resolved.runner);
  const healthLine = (r: RunnerInfo): string | null => {
    if (!r.health) return null;
    if (r.health.ok) return r.health.model ? `ready · ${r.health.model}` : "ready";
    if (r.health.status === "needs-setup") return "needs setup";
    return r.id === "local" ? "unreachable → the job will be Blocked, not sent to a cloud model" : "unreachable";
  };
  const costWord = (m: RunnerManifest) => (m.cost.model === "free" ? "$0" : m.cost.model === "metered" ? "credits" : "plan");
  return (
    <fieldset className="min-w-0">
      <legend className="text-label font-bold uppercase tracking-widest text-text-subtle">Runner</legend>
      <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap" role="radiogroup" aria-label="Runner">
        {(["auto", ...RUNNER_MANIFESTS.map((m) => m.id)] as RunnerChoice[]).map((c) => {
          const m = c === "auto" ? null : info(c);
          const needsSetup = !!m?.health && !m.health.ok && m.health.status === "needs-setup";
          const active = value === c;
          const overridden = isPrivate && c !== "local";
          return (
            <button key={c} type="button" role="radio" aria-checked={active} disabled={needsSetup} onClick={() => onChange(c)}
              title={m ? `${m.description}${m.health ? ` · ${m.health.detail}` : ""}` : "The default runner (JOBS_DEFAULT_RUNNER, or demo); a private job goes to Local instead"}
              className={cn("touch-target w-full rounded-control border px-2 py-1.5 text-left sm:w-auto sm:min-w-[84px] sm:px-3 sm:text-center",
                active ? "border-accent/60 bg-accent/15 text-text-primary" : "border-strong bg-surface-2 text-text-muted hover:text-text-primary",
                overridden && active && "border-dashed opacity-70", needsSetup && "opacity-40")}>
              <span className="block whitespace-nowrap text-[12px] font-semibold leading-tight sm:text-[13px]">{c === "auto" ? "Auto" : m!.label}</span>
              <span className="block text-[10px] text-text-subtle">{c === "auto" ? "default" : costWord(m!)}</span>
            </button>
          );
        })}
        {onPrivate ? (
          <button type="button" aria-pressed={isPrivate} disabled={lockDisabled} onClick={() => onPrivate(!isPrivate)}
            title="Private: the card is tagged PRIVACY: local-only and runs on Local only — never a cloud model"
            className={cn("touch-target inline-flex w-full items-center justify-center gap-1.5 rounded-control border px-2 text-[12px] sm:w-auto sm:px-3 sm:text-[13px]",
              isPrivate ? "border-success/50 bg-success/15 text-success" : "border-strong bg-surface-2 text-text-muted hover:text-text-primary")}>
            {isPrivate ? <Lock size={14} aria-hidden="true" /> : <LockOpen size={14} aria-hidden="true" />} Private
          </button>
        ) : null}
      </div>
      <p className={cn("mt-1.5 text-[12px]", resolved.forced ? "text-success" : "text-text-subtle")}>
        {resolved.why} · {effective.cost.hint}{healthLine(effective) ? ` · ${healthLine(effective)}` : ""}
      </p>
    </fieldset>
  );
}
