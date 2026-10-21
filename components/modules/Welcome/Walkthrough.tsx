"use client";

/**
 * components/modules/Welcome/Walkthrough — the seven-screen first run.
 * ────────────────────────────────────────────────────────────────────────────
 * Owns the answers, the progress bar and every network call; the screens
 * themselves are in WalkthroughSteps.tsx.
 *
 * Three things worth knowing:
 *  - Every Next/Back PUTs the answers to /api/welcome, so progress lives in
 *    DATA_DIR and resumes on any device. Nothing is kept in localStorage.
 *  - The last screen is a receipt, not a form: Next on the AI screen POSTs
 *    `finish`, which writes the persona entries and subscribes the feeds, and
 *    the answer to that request is what screen seven renders.
 *  - Skip is available on every screen and is a decision, not a failure: it is
 *    recorded, and Home keeps offering the tour quietly.
 */
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, Notice, PageHeader, PageShell } from "@/components/jolly/Foundation";
import { HELP } from "@/lib/help";
import { STEPS, stepIndex } from "@/lib/onboarding/steps";
import type { WalkthroughAnswers, WalkthroughReceipt, WalkthroughState } from "@/lib/onboarding/types";
import type { PublicAiSettings } from "@/lib/settings/ai";
import { StepAbout, StepBrain, StepFinish, StepInterests, StepPrivacy, StepStyle, StepWhat } from "./WalkthroughSteps";

const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };

export function Walkthrough({ state: initialState, ai: initialAi, demo }: { state: WalkthroughState; ai: PublicAiSettings; demo: boolean }) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [ai, setAi] = useState(initialAi);
  const [answers, setAnswers] = useState<WalkthroughAnswers>(initialState.answers);
  const [index, setIndex] = useState(stepIndex(initialState.stepId));
  const [receipt, setReceipt] = useState<WalkthroughReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = STEPS[index];
  const last = index === STEPS.length - 1;
  const patch = (partial: Partial<WalkthroughAnswers>) => setAnswers((a) => ({ ...a, ...partial }));

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/welcome", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => null)) as { state?: WalkthroughState; ai?: PublicAiSettings; receipt?: WalkthroughReceipt; error?: string } | null;
      if (!res.ok) { setError(json?.error ?? "That did not save. Your answers are still here — try again."); return null; }
      if (json?.state) setState(json.state);
      if (json?.ai) setAi(json.ai);
      return json;
    } catch {
      setError("The server did not answer. Your answers are still on this screen.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function move(to: number) {
    const target = Math.min(Math.max(to, 0), STEPS.length - 1);
    setBusy(true);
    setError(null);
    try {
      await fetch("/api/welcome", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stepId: STEPS[target].id, answers }) });
    } catch {
      // Moving on with unsaved answers is better than trapping them here; the
      // next successful write catches up.
      setError("Could not save that step. Your answers are still on screen.");
    } finally {
      setBusy(false);
    }
    setIndex(target);
  }

  async function finish() {
    const json = await post({ action: "finish", answers });
    if (!json) return;
    if (json.receipt) setReceipt(json.receipt);
    setIndex(STEPS.length - 1);
  }

  async function skip() {
    await post({ action: "skip" });
    router.push("/");
    router.refresh();
  }

  async function restart() {
    const json = await post({ action: "restart" });
    if (!json?.state) return;
    setAnswers(json.state.answers);
    setReceipt(null);
    setIndex(0);
  }

  function done() {
    router.push("/");
    router.refresh();
  }

  const feeds = receipt?.feeds.map((f) => f.title) ?? state.seeded.feedUrls.map(host);
  const lines = receipt?.entries ?? state.seeded.entryIds.length;

  return (
    <PageShell width="narrow">
      <PageHeader title="Welcome to JollyOS" help={HELP.welcome} lede="Seven short screens and it is set up for you. Skip any of it — your place is saved." />

      <Card className="p-4 sm:p-5">
        <div className="mb-3">
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <p className="text-label font-bold uppercase tracking-wider text-text-subtle">Step {index + 1} of {STEPS.length}</p>
            {state.status === "done" ? <p className="text-label text-success">Already set up</p> : null}
          </div>
          <div
            role="progressbar"
            aria-valuenow={index + 1}
            aria-valuemin={1}
            aria-valuemax={STEPS.length}
            aria-label={`Step ${index + 1} of ${STEPS.length}: ${step.title}`}
            className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
          >
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${((index + 1) / STEPS.length) * 100}%` }} />
          </div>
        </div>

        <h2 className="text-lg font-bold">{step.title}</h2>
        <p className="mb-3.5 mt-0.5 text-sm text-text-muted">{step.lede}</p>

        {step.id === "what" ? <StepWhat /> : null}
        {step.id === "about" ? <StepAbout answers={answers} patch={patch} /> : null}
        {step.id === "interests" ? <StepInterests answers={answers} patch={patch} /> : null}
        {step.id === "style" ? <StepStyle answers={answers} patch={patch} /> : null}
        {step.id === "privacy" ? <StepPrivacy answers={answers} patch={patch} /> : null}
        {step.id === "brain" ? <StepBrain answers={answers} patch={patch} ai={ai} demo={demo} onSaved={setAi} /> : null}
        {step.id === "finish" ? <StepFinish answers={answers} lines={lines} feeds={feeds} /> : null}
      </Card>

      {error ? <Notice tone="warning" className="mt-3">{error}</Notice> : null}

      <div className="mt-3 flex items-center gap-2">
        {index > 0 && !last ? (
          <button type="button" className="btn-ghost" onClick={() => void move(index - 1)} disabled={busy}>
            <ArrowLeft size={16} aria-hidden="true" />
            Back
          </button>
        ) : null}
        {last ? (
          <>
            <button type="button" className="btn-primary flex-1" onClick={done} disabled={busy}>
              Open my dashboard
              <ArrowRight size={16} aria-hidden="true" />
            </button>
            <button type="button" className="btn-ghost" onClick={() => void restart()} disabled={busy} aria-label="Run the walkthrough again">
              <RotateCcw size={16} aria-hidden="true" />
              Again
            </button>
          </>
        ) : index === STEPS.length - 2 ? (
          <button type="button" className="btn-primary flex-1" onClick={() => void finish()} disabled={busy}>
            {busy ? "Setting up…" : "Finish setup"}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        ) : (
          <button type="button" className="btn-primary flex-1" onClick={() => void move(index + 1)} disabled={busy}>
            Next
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {last ? null : (
        <p className="mt-2.5 text-center text-[13px]">
          <button type="button" className="text-text-subtle underline-offset-2 hover:text-text-primary hover:underline" onClick={() => void skip()} disabled={busy}>
            Skip for now
          </button>
          <span className="mx-2 text-text-subtle" aria-hidden="true">&middot;</span>
          <Link href="/settings" className="text-text-subtle underline-offset-2 hover:text-text-primary hover:underline">You can run this again from Settings</Link>
        </p>
      )}
      {demo ? (
        <p className="mt-3 text-center text-[12px] text-text-subtle">
          Demo mode: answers are written to the demo&rsquo;s own data folder and no key is ever saved. <Link href="/welcome?replay=1" className="underline-offset-2 hover:underline">Replay from screen one</Link>.
        </p>
      ) : null}
    </PageShell>
  );
}
