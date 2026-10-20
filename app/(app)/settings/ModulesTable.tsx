"use client";

/** Toggle modules on and off; the registry does the rest on the next request. */
import { useState } from "react";
import { Chip } from "@/components/jolly/Foundation";
import type { ModuleStatus } from "@/lib/modules/types";

export function ModulesTable({ initial }: { initial: ModuleStatus[] }) {
  const [modules, setModules] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(id: string, enabled: boolean) {
    setBusy(id);
    try {
      const res = await fetch("/api/modules", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, enabled }) });
      if (res.ok) setModules(((await res.json()) as { modules: ModuleStatus[] }).modules);
    } finally {
      setBusy(null);
    }
  }

  return (
    <ul className="divide-y divide-white/[0.06]">
      {modules.map((m) => (
        <li key={m.manifest.id} className="flex items-center gap-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{m.manifest.label} <span className="font-normal text-text-subtle">· {m.manifest.id}</span></p>
            <p className="text-[13px] text-text-muted">{m.manifest.description}</p>
            {m.state === "needs-setup" ? <p className="text-[12px] text-warning">Missing: {m.missingEnv.concat(m.missingProviders).join(", ")}</p> : null}
            {m.notes.map((n) => <p key={n} className="text-[12px] text-text-subtle">{n}</p>)}
          </div>
          <Chip tone={m.state === "ready" ? "success" : m.state === "needs-setup" ? "warning" : "neutral"}>{m.state}</Chip>
          <button type="button" role="switch" aria-checked={m.enabled} aria-label={`${m.enabled ? "Disable" : "Enable"} ${m.manifest.label}`} disabled={busy === m.manifest.id} onClick={() => void toggle(m.manifest.id, !m.enabled)} className={`touch-target rounded-control border px-3 text-sm font-semibold ${m.enabled ? "border-accent/40 bg-accent/15 text-accent-soft" : "border-strong text-text-muted"}`}>
            {m.enabled ? "On" : "Off"}
          </button>
        </li>
      ))}
    </ul>
  );
}
