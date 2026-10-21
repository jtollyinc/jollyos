import Link from "next/link";
import { ArrowRight, KeyRound, Sparkles } from "lucide-react";
import { Card, PageHeader, PageShell } from "@/components/jolly/Foundation";
import { getSession } from "@/lib/auth/session";
import { configSummary } from "@/lib/config";
import { HELP } from "@/lib/help";
import { queueCounts, rawFilesSummary } from "@/lib/import/queue";
import { loadStatuses } from "@/lib/modules/registry";
import { checklistProgress, checklistItems } from "@/lib/onboarding/checklist";
import { readWalkthrough, walkthroughFinished } from "@/lib/onboarding/store";
import { readCachedBrief } from "@/lib/brief/build";
import { readJobs } from "@/lib/jobs/store";
import { deckStats } from "@/lib/persona/deck-store";
import { readInterests } from "@/lib/persona/interests-store";
import { providersFromEnv } from "@/lib/providers";
import { publicAiSettings, runtimeEnv } from "@/lib/settings/ai";
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
  const env = runtimeEnv();
  const cfg = configSummary(env);
  const providers = providersFromEnv(env);
  const statuses = loadStatuses();
  const raw = rawFilesSummary();
  const queue = queueCounts();
  const interests = readInterests();
  const ai = publicAiSettings();
  const walkthrough = readWalkthrough();
  const settled = walkthroughFinished(walkthrough);
  const checklist = checklistProgress(checklistItems({
    walkthroughFinished: settled,
    jobs: readJobs().length,
    briefBuilt: Boolean(readCachedBrief()),
    deckAnswers: deckStats({ includePrivate: true }).answered,
    imports: queue.total,
  }));
  const brainLabel = ai.brain === "api" ? `hosted key (${ai.vendor}${ai.apiKeyHint ? ` ${ai.apiKeyHint}` : ""})` : ai.brain === "local" ? `a model on this machine${ai.localBaseUrl ? ` at ${ai.localBaseUrl}` : ""}` : "none — the built-in responder answers";

  return (
    <PageShell width="narrow">
      <PageHeader title="Settings" help={HELP.settings} />
      <div className="space-y-4">
        <Card className="p-4">
          <h2 className="mb-2 flex items-center gap-2 text-base font-semibold">
            <Sparkles size={16} className="text-accent-soft" aria-hidden="true" />
            First run
          </h2>
          <dl>
            <Row k="Welcome walkthrough" v={walkthrough.status === "done" ? "finished" : walkthrough.status === "skipped" ? "skipped" : walkthrough.status === "in-progress" ? "half done" : "not started"} />
            <Row k="It set up" v={walkthrough.seeded.entryIds.length ? `${walkthrough.seeded.entryIds.length} persona lines · ${walkthrough.seeded.feedUrls.length} feeds` : "nothing yet"} />
            <Row k="Getting started list" v={walkthrough.checklistDismissedAt ? "hidden" : checklist.complete ? "complete" : `${checklist.done} of ${checklist.total} done`} />
            <Row k="AI brain (chosen here)" v={brainLabel} />
          </dl>
          <p className="mt-2 text-[12px] text-text-subtle">
            Running it again replaces the lines and feeds it created last time; anything you wrote yourself is left alone.
            {ai.envProvides.apiKey || ai.envProvides.localBaseUrl ? " A model set in this server's environment always wins over the one chosen here." : ""}
          </p>
          <Link href="/welcome?replay=1" className="btn-ghost mt-3">
            {settled ? "Run the walkthrough again" : "Finish the walkthrough"}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </Card>
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
          <h2 className="mb-2 text-base font-semibold">Your context</h2>
          <dl>
            <Row k="Import review queue" v={queue.pending ? `${queue.pending} waiting for you` : queue.total ? `${queue.approved} approved · ${queue.rejected} rejected` : "empty"} />
            <Row k="Derived interests" v={interests.version === "none" ? "none yet" : `${interests.interests.length} interests · ${interests.avoid.length} avoid`} />
            <Row k="Raw uploads kept" v={raw.files ? `${raw.files} file${raw.files === 1 ? "" : "s"} · ${Math.max(1, Math.round(raw.bytes / 1024))} KB in DATA_DIR/imports/raw` : "none"} />
          </dl>
          <Link href="/persona/import" className="btn-ghost mt-3">
            Import your context from ChatGPT, Claude, Gemini, Notion or notes
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </Card>
        <Card className="p-4">
          <h2 className="mb-2 text-base font-semibold">Instance</h2>
          <dl>
            <Row k="Signed in as" v={session.demo ? `${session.displayName} (fictional demo)` : session.username} />
            <Row k="Password" v={session.demo ? "none in demo mode" : "scrypt hash in DATA_DIR/owner.json"} />
            <Row k="Demo mode" v={cfg.demoMode ? "on" : "off"} />
            <Row k="DATA_DIR" v={cfg.dataDir} />
            <Row k="AUTH_SECRET" v={cfg.authSecret === "env" ? "from environment" : "generated in DATA_DIR"} />
            <Row k="Brief feeds" v={String(cfg.briefFeeds)} />
          </dl>
          {session.demo ? null : (
            <Link href="/settings/password" className="btn-ghost mt-3">
              <KeyRound size={14} aria-hidden="true" />
              Change password
            </Link>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
