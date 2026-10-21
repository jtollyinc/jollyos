"use client";

/**
 * components/modules/Welcome/WalkthroughSteps — the body of each screen.
 * ────────────────────────────────────────────────────────────────────────────
 * One exported component per step id in lib/onboarding/steps, plus the three
 * controls they share (Choice, Chips, Field). The shell (Walkthrough.tsx) owns
 * the answers, the progress and every network call; these are presentational,
 * except the brain screen's Test button, which has to ask the server.
 *
 * Phone first: one column, 44px targets, nothing below 11px, and short enough
 * that a 390x844 screen never needs to scroll past the Next button.
 */
import { Bot, Check, KeyRound, Loader2, Newspaper, ServerCog, ShieldCheck, Sparkles, User } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Card, Chip, Notice } from "@/components/jolly/Foundation";
import { SENSITIVE, TOPIC_CHIPS } from "@/lib/onboarding/topics";
import { BRIEF_LENGTHS, BRIEF_TONES, type BrainChoice, type WalkthroughAnswers } from "@/lib/onboarding/types";
import type { PublicAiSettings } from "@/lib/settings/ai";

export interface StepProps {
  answers: WalkthroughAnswers;
  patch: (partial: Partial<WalkthroughAnswers>) => void;
}

// ── Shared controls ────────────────────────────────────────────────────────

/** A big tappable radio. aria-pressed, so a screen reader reads the state. */
function Choice({ selected, onSelect, title, hint, icon }: { selected: boolean; onSelect: () => void; title: string; hint?: string; icon?: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`touch-target flex w-full items-center gap-3 rounded-control border px-3 py-2.5 text-left ${selected ? "border-accent bg-accent/10" : "border-strong bg-surface-2 hover:bg-surface-hover"}`}
    >
      {icon ? <span className={selected ? "text-accent-soft" : "text-text-subtle"} aria-hidden="true">{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        {hint ? <span className="mt-0.5 block text-[13px] font-normal leading-snug text-text-muted">{hint}</span> : null}
      </span>
      {selected ? <Check size={16} className="shrink-0 text-accent-soft" aria-hidden="true" /> : null}
    </button>
  );
}

/** A row of pills. Multi-select, keyboard reachable, 44px tall. */
function Chips({ options, value, onToggle, label }: { options: { id: string; label: string }[]; value: string[]; onToggle: (id: string) => void; label: string }) {
  return (
    <div>
      <p className="mb-1.5 text-label font-bold uppercase tracking-wider text-text-subtle">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(o.id)}
              className={`inline-flex min-h-11 items-center rounded-full border px-3 text-[13px] font-semibold ${on ? "border-accent bg-accent/15 text-accent-soft" : "border-strong bg-surface-2 text-text-muted hover:bg-surface-hover"}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-label font-bold uppercase tracking-wider text-text-subtle">{label}</span>
      {hint ? <span className="mt-0.5 block text-[12px] font-normal text-text-muted">{hint}</span> : null}
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

// ── 1. What JollyOS is ─────────────────────────────────────────────────────

const PARTS = [
  { icon: Bot, title: "Jobs", line: "Type a thought. It becomes a card, and you pick who does the work." },
  { icon: Newspaper, title: "Daily Brief", line: "Your feeds, read for you and folded away until you tap." },
  { icon: User, title: "You", line: "A private model of how you decide, so answers sound like you." },
];

export function StepWhat() {
  return (
    <div className="space-y-2.5">
      {PARTS.map((p) => (
        <Card key={p.title} className="flex items-start gap-3 p-3.5">
          <span className="shrink-0 text-accent-soft" aria-hidden="true"><p.icon size={22} /></span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{p.title}</span>
            <span className="mt-0.5 block text-[13px] leading-relaxed text-text-muted">{p.line}</span>
          </span>
        </Card>
      ))}
      <p className="pt-1 text-[13px] text-text-muted">Everything is stored on this machine. Nothing is sent anywhere unless you point JollyOS at a model yourself.</p>
    </div>
  );
}

// ── 2. About you ───────────────────────────────────────────────────────────

export function StepAbout({ answers, patch }: StepProps) {
  return (
    <div className="space-y-3.5">
      <Field label="What should it call you?" hint="A first name or a nickname. Not your login.">
        <input className="field" value={answers.name} onChange={(e) => patch({ name: e.target.value })} maxLength={60} autoComplete="given-name" placeholder="Alex" />
      </Field>
      <Field label="What do you do?" hint="One line. It shapes how answers are written.">
        <input className="field" value={answers.role} onChange={(e) => patch({ role: e.target.value })} maxLength={160} placeholder="Product designer at a two-person studio" />
      </Field>
      <Field label="What are you trying to get done right now?" hint="Your top one or two. You can change this any time.">
        <textarea className="field" rows={3} value={answers.goals} onChange={(e) => patch({ goals: e.target.value })} maxLength={400} placeholder="Ship the design system v2 and stop losing half my week to email" />
      </Field>
    </div>
  );
}

// ── 3. What you follow ─────────────────────────────────────────────────────

export function StepInterests({ answers, patch }: StepProps) {
  const toggle = (id: string) => patch({ topics: answers.topics.includes(id) ? answers.topics.filter((t) => t !== id) : [...answers.topics, id] });
  const opts = (group: "work" | "life") => TOPIC_CHIPS.filter((c) => c.group === group).map((c) => ({ id: c.id, label: c.label }));
  return (
    <div className="space-y-3.5">
      <Chips label="Work &amp; craft" options={opts("work")} value={answers.topics} onToggle={toggle} />
      <Chips label="Life" options={opts("life")} value={answers.topics} onToggle={toggle} />
      <Field label="Anything else?" hint="Free text. Written into your persona as-is.">
        <input className="field" value={answers.interestsText} onChange={(e) => patch({ interestsText: e.target.value })} maxLength={400} placeholder="espresso gear, sourdough, 90s sci-fi" />
      </Field>
      <p className="text-[13px] text-text-muted">
        {answers.topics.length
          ? `${answers.topics.length} picked — JollyOS will subscribe you to working public feeds for these and rank every story against them.`
          : "Pick none and the Brief still works: it just shows your jobs and your decisions until you add a feed."}
      </p>
    </div>
  );
}

// ── 4. How you like information ────────────────────────────────────────────

export function StepStyle({ answers, patch }: StepProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-label font-bold uppercase tracking-wider text-text-subtle">How much</p>
        {BRIEF_LENGTHS.map((l) => <Choice key={l.id} selected={answers.briefLength === l.id} onSelect={() => patch({ briefLength: l.id })} title={l.label} hint={l.hint} />)}
      </div>
      <div className="space-y-1.5">
        <p className="text-label font-bold uppercase tracking-wider text-text-subtle">How it reads</p>
        {BRIEF_TONES.map((t) => <Choice key={t.id} selected={answers.tone === t.id} onSelect={() => patch({ tone: t.id })} title={t.label} hint={t.hint} />)}
      </div>
      <Field label="When does your morning start?" hint="Used as your morning block, not an alarm.">
        <input className="field" type="time" value={answers.morningTime} onChange={(e) => patch({ morningTime: e.target.value })} step={300} />
      </Field>
    </div>
  );
}

// ── 5. What stays on this machine ──────────────────────────────────────────

export function StepPrivacy({ answers, patch }: StepProps) {
  const toggle = (id: string) => patch({ localOnly: answers.localOnly.includes(id) ? answers.localOnly.filter((x) => x !== id) : [...answers.localOnly, id] });
  return (
    <div className="space-y-2.5">
      <p className="text-[13px] leading-relaxed text-text-muted">
        What you leave on is tagged <strong className="text-text-primary">local only</strong>: JollyOS will not put it in a request to a model somebody else runs — not in a brief, not in an answer, not in a job.
      </p>
      {SENSITIVE.map((c) => {
        const on = answers.localOnly.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            role="switch"
            aria-checked={on}
            onClick={() => toggle(c.id)}
            className={`touch-target flex w-full items-center gap-3 rounded-control border px-3 py-2.5 text-left ${on ? "border-accent bg-accent/10" : "border-strong bg-surface-2"}`}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{c.label}</span>
              <span className="mt-0.5 block text-[13px] font-normal leading-snug text-text-muted">{c.plain}</span>
            </span>
            <Chip tone={on ? "accent" : "neutral"}>{on ? "Local only" : "Shareable"}</Chip>
          </button>
        );
      })}
      <p className="pt-0.5 text-[12px] text-text-subtle">
        <ShieldCheck size={12} className="mr-1 inline align-[-2px]" aria-hidden="true" />
        With no model on this machine, local-only content is simply never sent — it is not quietly downgraded.
      </p>
    </div>
  );
}

// ── 6. The AI brain ────────────────────────────────────────────────────────

interface TestState { busy: boolean; ok: boolean | null; message: string }

export function StepBrain({ answers, patch, ai, onSaved, demo }: StepProps & { ai: PublicAiSettings; onSaved: (ai: PublicAiSettings) => void; demo: boolean }) {
  const [baseUrl, setBaseUrl] = useState(ai.localBaseUrl || "http://localhost:1234/v1");
  // The address box starts pre-filled with the LM Studio default, so "there is
  // text in it" is not consent. Only an edit, or a Test that actually answered,
  // commits it as the model this JollyOS uses.
  const [addressEdited, setAddressEdited] = useState(false);
  const [vendor, setVendor] = useState(ai.vendor);
  const [apiKey, setApiKey] = useState("");
  const [test, setTest] = useState<TestState>({ busy: false, ok: null, message: "" });
  const brain = answers.brain;

  const choose = (next: BrainChoice) => {
    setTest({ busy: false, ok: null, message: "" });
    setAddressEdited(false);
    patch({ brain: next });
    // Selecting an option must NOT commit the address box's placeholder value.
    // Tapping "a model on this machine" just to read the hint would otherwise
    // point the whole app at http://localhost:1234/v1 — and if nothing is
    // listening there, every summary comes back "Summary unavailable". The
    // address is committed when the owner actually acts on it (blur or Test);
    // an empty one means "keep what is stored", and brain=local with nothing
    // stored falls back to the built-in responder (lib/settings/ai runtimeEnv).
    void save(next, { commitUrl: false });
  };

  async function save(next: BrainChoice = brain, { commitUrl = true } = {}) {
    const res = await fetch("/api/welcome/brain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brain: next, vendor, localBaseUrl: commitUrl ? baseUrl : "", apiKey }),
    });
    const json = (await res.json().catch(() => null)) as { ai?: PublicAiSettings; error?: string } | null;
    if (json?.ai) onSaved(json.ai);
    if (!res.ok && json?.error) setTest({ busy: false, ok: false, message: json.error });
  }

  function runTest() {
    setTest({ busy: true, ok: null, message: "" });
    fetch("/api/welcome/brain", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brain, vendor, localBaseUrl: baseUrl, apiKey }),
    })
      .then((res) => res.json() as Promise<{ ok: boolean; message: string }>)
      .then((r) => { setTest({ busy: false, ok: r.ok, message: r.message }); if (r.ok) void save(); })
      .catch(() => setTest({ busy: false, ok: false, message: "The test could not run — the server did not answer." }));
  }

  return (
    <div className="space-y-2.5">
      <Choice selected={brain === "none"} onSelect={() => choose("none")} icon={<Sparkles size={20} />} title="None for now" hint="Everything works. Summaries and answers come from a built-in responder, free and offline." />
      <Choice selected={brain === "local"} onSelect={() => choose("local")} icon={<ServerCog size={20} />} title="A model on this machine" hint="LM Studio, Ollama, llama.cpp. Free, private, and the only thing that ever sees local-only content." />
      <Choice selected={brain === "api"} onSelect={() => choose("api")} icon={<KeyRound size={20} />} title="A hosted key" hint="Anthropic or OpenAI. Best answers, costs money, never sees your local-only items." />

      {brain === "local" ? (
        <div className="space-y-2 rounded-control border border-subtle bg-surface-2/40 p-3">
          <Field label="Its address" hint="LM Studio: http://localhost:1234/v1 · Ollama: http://localhost:11434/v1">
            <input className="field" type="url" inputMode="url" value={baseUrl} onChange={(e) => { setBaseUrl(e.target.value); setAddressEdited(true); }} onBlur={() => { if (addressEdited && baseUrl.trim()) void save(); }} autoCapitalize="none" spellCheck={false} />
          </Field>
          <TestRow test={test} onTest={runTest} />
        </div>
      ) : null}

      {brain === "api" ? (
        <div className="space-y-2 rounded-control border border-subtle bg-surface-2/40 p-3">
          <div className="flex gap-1.5">
            <Choice selected={vendor === "anthropic"} onSelect={() => setVendor("anthropic")} title="Anthropic" />
            <Choice selected={vendor === "openai"} onSelect={() => setVendor("openai")} title="OpenAI" />
          </div>
          <Field label="Your key" hint="Stored on this machine only, in a file only you can read. It is never shown again.">
            <input className="field" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" spellCheck={false} placeholder={ai.apiKeySet ? `saved ${ai.apiKeyHint}` : "paste it here"} />
          </Field>
          <TestRow test={test} onTest={runTest} />
          {demo ? <Notice tone="info">Demo mode: a key is tested but never saved.</Notice> : null}
        </div>
      ) : null}

      {ai.envProvides.apiKey || ai.envProvides.localBaseUrl ? (
        <p className="text-[12px] text-text-subtle">A model is already set in this server&rsquo;s environment, and that one wins. What you pick here is used only where the environment is silent.</p>
      ) : null}
    </div>
  );
}

function TestRow({ test, onTest }: { test: TestState; onTest: () => void }) {
  return (
    <div className="space-y-2">
      <button type="button" className="btn-ghost w-full" onClick={onTest} disabled={test.busy}>
        {test.busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
        {test.busy ? "Testing…" : "Test it"}
      </button>
      {test.message ? <Notice tone={test.ok ? "success" : "warning"}>{test.message}</Notice> : null}
    </div>
  );
}

// ── 7. You are set up ──────────────────────────────────────────────────────

export function StepFinish({ answers, lines, feeds }: { answers: WalkthroughAnswers; lines: number; feeds: string[] }) {
  const brainLine = answers.brain === "api" ? "a hosted key" : answers.brain === "local" ? "a model on this machine" : "the built-in responder (no model needed)";
  const kept = SENSITIVE.filter((c) => answers.localOnly.includes(c.id)).map((c) => c.label.toLowerCase());
  return (
    <div className="space-y-3">
      <ul className="space-y-1.5">
        <Done>{lines} line{lines === 1 ? "" : "s"} written into your persona{answers.name ? `, starting with what to call you` : ""}.</Done>
        <Done>{feeds.length ? `${feeds.length} feed${feeds.length === 1 ? "" : "s"} subscribed: ${feeds.join(", ")}.` : "No feeds yet — add one any time from the Daily Brief."}</Done>
        <Done>{kept.length ? `Never sent to a hosted model: ${kept.join(", ")}.` : "Nothing marked local-only — you can change that in your persona."}</Done>
        <Done>Answers come from {brainLine}.</Done>
      </ul>
      <Notice tone="info">
        Next: your dashboard has a short <strong>Getting started</strong> list that ticks itself off as you use the app. It disappears when you are done with it.
      </Notice>
      <p className="text-[13px] text-text-muted">
        Want more? <Link href="/persona/import" className="text-accent-soft underline-offset-2 hover:underline">Import what ChatGPT or Claude already knows about you</Link> — it takes one file and nothing is kept until you approve it.
      </p>
    </div>
  );
}

function Done({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm leading-relaxed">
      <Check size={16} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}
