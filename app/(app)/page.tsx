/**
 * app/(app)/page — Home. One loud thing (what needs you), the capture box,
 * then one tile per module with its status. Server component: reads the
 * stores directly, no client fetch on first paint.
 *
 * First-run shape: until the owner has finished or deliberately skipped the
 * welcome walkthrough, the one loud thing IS the walkthrough — a brand-new
 * install has nothing else to say. Afterwards the Getting started checklist
 * sits under the capture box until it is complete or dismissed; every row of it
 * is derived from real state (lib/onboarding/checklist).
 */
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { Card, Chip, HeroStrip, PageHeader, PageShell, ToolTile } from "@/components/jolly/Foundation";
import { Icon } from "@/components/jolly/icons";
import { CaptureBox } from "@/components/modules/Jobs/CaptureBox";
import { GettingStarted } from "@/components/modules/Welcome/GettingStarted";
import { getSession } from "@/lib/auth/session";
import { readCachedBrief } from "@/lib/brief/build";
import { HELP } from "@/lib/help";
import { queueCounts } from "@/lib/import/queue";
import { jobCounts, readJobs } from "@/lib/jobs/store";
import { loadStatuses } from "@/lib/modules/registry";
import { checklistItems, checklistProgress } from "@/lib/onboarding/checklist";
import { readWalkthrough, walkthroughFinished } from "@/lib/onboarding/store";
import { deckStats } from "@/lib/persona/deck-store";
import { personaCounts, readEntries } from "@/lib/persona/store";
import { providersFromEnv } from "@/lib/providers";
import { runtimeEnv } from "@/lib/settings/ai";
import { greeting } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = (await getSession())!;
  const statuses = loadStatuses();
  const enabled = new Set(statuses.filter((s) => s.enabled).map((s) => s.manifest.id));
  const jobs = enabled.has("jobs") ? readJobs() : [];
  const counts = enabled.has("jobs") ? jobCounts(jobs) : null;
  const brief = enabled.has("brief") ? readCachedBrief() : null;
  const deck = enabled.has("persona") ? deckStats({ includePrivate: true }) : null;
  const persona = enabled.has("persona") ? personaCounts(readEntries()) : null;
  const providers = providersFromEnv(runtimeEnv());

  const walkthrough = readWalkthrough();
  const settled = walkthroughFinished(walkthrough);
  // "What should it call you?" beats the login name, which is often lower-case.
  const callMe = walkthrough.answers.name || session.displayName.split(" ")[0];
  const checklist = checklistItems({
    walkthroughFinished: settled,
    jobs: jobs.length,
    briefBuilt: Boolean(brief),
    deckAnswers: deck?.answered ?? 0,
    imports: queueCounts().total,
  });
  const progress = checklistProgress(checklist);
  const showChecklist = settled && !walkthrough.checklistDismissedAt && !progress.complete;

  const needs: string[] = [];
  if (counts && counts.inbox + counts.running) needs.push(`${counts.inbox + counts.running} job${counts.inbox + counts.running === 1 ? "" : "s"} on the board`);
  if (counts && counts.blocked) needs.push(`${counts.blocked} blocked`);
  if (enabled.has("brief")) needs.push(brief ? "today's brief is ready" : "today's brief is not built yet");
  if (deck && deck.cards - deck.answered > 0) needs.push(`${deck.cards - deck.answered} deck cards waiting`);
  const needsSetup = statuses.filter((s) => s.state === "needs-setup");

  return (
    <PageShell>
      <PageHeader title={`${greeting()}, ${callMe}`} help={HELP.home} lede={session.demo ? "You are looking at a fictional demo account." : undefined} />

      {settled ? (
        <HeroStrip title="Right now" icon={<Sparkles size={12} aria-hidden="true" />} action={counts && counts.inbox + counts.running ? { href: "/jobs", label: "Open jobs" } : enabled.has("brief") ? { href: "/brief", label: "Open brief" } : null}>
          {needs.length ? needs.join(" · ") : "Nothing needs you. Capture something below."}
        </HeroStrip>
      ) : (
        <HeroStrip title="Start here" icon={<Sparkles size={12} aria-hidden="true" />} action={{ href: "/welcome", label: walkthrough.status === "in-progress" ? "Pick it up" : "Set it up" }}>
          {walkthrough.status === "in-progress"
            ? "Your walkthrough is half done — it remembers where you stopped. Finish it and the Brief starts arriving about what you actually follow."
            : "Nothing is set up for you yet. Seven short screens and JollyOS knows what to call you, what you follow and what must never leave this machine."}
        </HeroStrip>
      )}

      {enabled.has("jobs") ? <Card className="mb-4 p-4"><CaptureBox /></Card> : null}

      {showChecklist ? <GettingStarted items={checklist} /> : null}

      {needsSetup.length ? (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-[13px] text-text-muted">
          Needs setup:
          {needsSetup.map((s) => <Chip key={s.manifest.id} tone="warning">{s.manifest.label}: {s.missingEnv.concat(s.missingProviders).join(", ")}</Chip>)}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {statuses.filter((s) => s.enabled).map((s) => {
          const line =
            s.manifest.id === "jobs" && counts ? `${counts.inbox} inbox · ${counts.running} running${counts.blocked ? ` · ${counts.blocked} blocked` : ""} · ${counts.done} done`
            : s.manifest.id === "brief" ? (brief ? brief.headline : "Not built yet — open to build it")
            : s.manifest.id === "persona" && persona && deck ? `${persona.total} entries · ${deck.answered} swipes`
            : s.manifest.description;
          return (
            <ToolTile key={s.manifest.id} href={s.manifest.routes[0].href} title={s.manifest.label} icon={<Icon name={s.manifest.icon} size={20} />} badge={s.state === "needs-setup" ? <Chip tone="warning">needs setup</Chip> : undefined}>
              {line}
            </ToolTile>
          );
        })}
      </div>

      <p className="mt-6 text-[12px] text-text-subtle">
        Model: {providers.default.label} ({providers.default.model}){providers.local ? " · local model available for local-only content" : " · no local model: local-only content is never sent anywhere"}.
        {settled ? <> <Link href="/welcome" className="underline-offset-2 hover:underline">Run the walkthrough again</Link>.</> : null}
      </p>
    </PageShell>
  );
}
