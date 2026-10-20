import { Card, PageHeader, PageShell } from "@/components/jolly/Foundation";
import { getSession } from "@/lib/auth/session";
import { configSummary } from "@/lib/config";
import { loadStatuses } from "@/lib/modules/registry";
import { providersFromEnv } from "@/lib/providers";
import { ModulesTable } from "./ModulesTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-subtle py-2 last:border-0"><dt className="text-sm text-text-muted">{k}</dt><dd className="text-right text-sm">{v}</dd></div>
  );
}

/** Settings: which modules are on, which provider answers, what is configured. No secret values. */
export default async function SettingsPage() {
  const session = (await getSession())!;
  const cfg = configSummary();
  const providers = providersFromEnv();
  const statuses = loadStatuses();

  return (
    <PageShell width="narrow">
      <PageHeader title="Settings" lede="Everything here comes from .env and DATA_DIR. Secret values are never shown." />
      <div className="space-y-4">
        <Card className="p-4">
          <h2 className="mb-2 text-base font-semibold">Modules</h2>
          <ModulesTable initial={statuses} />
        </Card>
        <Card className="p-4">
          <h2 className="mb-2 text-base font-semibold">Model providers</h2>
          <dl>
            <Row k="Default provider" v={`${providers.default.label} (${providers.default.model})`} />
            <Row k="Local provider (gets local-only content)" v={providers.local ? `${providers.local.label} at ${cfg.local.baseUrl}` : "not configured — local-only content is withheld"} />
            <Row k="Anthropic key" v={cfg.anthropic.keySet ? "set" : "not set"} />
            <Row k="OpenAI key" v={cfg.openai.keySet ? "set" : "not set"} />
            <Row k="LLM_PROVIDER" v={cfg.llmProvider} />
          </dl>
          {providers.warnings.length ? <ul className="mt-3 space-y-1 text-[13px] text-warning">{providers.warnings.map((w) => <li key={w}>{w}</li>)}</ul> : null}
        </Card>
        <Card className="p-4">
          <h2 className="mb-2 text-base font-semibold">Instance</h2>
          <dl>
            <Row k="Signed in as" v={session.demo ? `${session.displayName} (fictional demo)` : session.username} />
            <Row k="Demo mode" v={cfg.demoMode ? "on" : "off"} />
            <Row k="DATA_DIR" v={cfg.dataDir} />
            <Row k="AUTH_SECRET" v={cfg.authSecret === "env" ? "from environment" : "generated in DATA_DIR"} />
            <Row k="Brief feeds" v={String(cfg.briefFeeds)} />
          </dl>
        </Card>
      </div>
    </PageShell>
  );
}
