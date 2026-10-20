/**
 * components/modules/NeedsSetup — what a module page shows instead of
 * crashing when its required configuration is missing.
 */
import { Wrench } from "lucide-react";
import { Card, PageHeader, PageShell } from "@/components/jolly/Foundation";
import type { ModuleStatus } from "@/lib/modules/types";

export function NeedsSetup({ status }: { status: ModuleStatus }) {
  return (
    <PageShell width="narrow">
      <PageHeader title={status.manifest.label} lede={status.manifest.description} />
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold"><Wrench size={18} className="text-warning" aria-hidden="true" />Needs setup</h2>
        <p className="mt-2 text-sm text-text-muted">This module is enabled but cannot run until the following is configured. Set it in <code>.env</code> (see <code>.env.example</code>) and restart.</p>
        {status.missingEnv.length ? (
          <ul className="mt-3 space-y-1 text-sm">
            {status.missingEnv.map((v) => <li key={v}><code className="rounded bg-surface-2 px-1.5 py-0.5">{v}</code> is not set</li>)}
          </ul>
        ) : null}
        {status.missingProviders.length ? (
          <ul className="mt-3 space-y-1 text-sm">
            {status.missingProviders.map((p) => <li key={p}>Provider <code className="rounded bg-surface-2 px-1.5 py-0.5">{p}</code> is not configured</li>)}
          </ul>
        ) : null}
        <p className="mt-4 text-sm text-text-muted">Tip: <code>DEMO_MODE=true</code> runs this module on fixtures with no configuration at all.</p>
      </Card>
    </PageShell>
  );
}
