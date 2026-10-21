/**
 * components/modules/NeedsSetup — what a module page shows instead of
 * crashing when its required configuration is missing.
 *
 * Two audiences, so two paths: somebody running from source edits .env, and
 * somebody who double-clicked a zip has no .env and never will. The second path
 * is the walkthrough, which configures the same things from the UI.
 */
import Link from "next/link";
import { ArrowRight, Wrench } from "lucide-react";
import { Card, PageHeader, PageShell } from "@/components/jolly/Foundation";
import type { ModuleStatus } from "@/lib/modules/types";

export function NeedsSetup({ status }: { status: ModuleStatus }) {
  return (
    <PageShell width="narrow">
      <PageHeader title={status.manifest.label} lede={status.manifest.description} />
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold"><Wrench size={18} className="text-warning" aria-hidden="true" />Not ready yet</h2>
        <p className="mt-2 text-sm text-text-muted">
          This tool is switched on but still needs one thing. The quickest fix is the welcome walkthrough — it sets up a model and your feeds from this screen, with no files to edit.
        </p>
        <Link href="/welcome" className="btn-primary mt-3">
          Set it up for me
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
        {status.missingEnv.length || status.missingProviders.length ? (
          <>
            <p className="mt-5 text-label font-bold uppercase tracking-wider text-text-subtle">Running from source?</p>
            <p className="mt-1 text-sm text-text-muted">Set the following in <code>.env</code> (see <code>.env.example</code>) and restart.</p>
            <ul className="mt-2 space-y-1 text-sm">
              {status.missingEnv.map((v) => <li key={v}><code className="rounded bg-surface-2 px-1.5 py-0.5">{v}</code> is not set</li>)}
              {status.missingProviders.map((p) => <li key={p}>Provider <code className="rounded bg-surface-2 px-1.5 py-0.5">{p}</code> is not configured</li>)}
            </ul>
            <p className="mt-3 text-sm text-text-muted">Or run with <code>DEMO_MODE=true</code> to see this tool on fixtures with no configuration at all.</p>
          </>
        ) : null}
      </Card>
    </PageShell>
  );
}
