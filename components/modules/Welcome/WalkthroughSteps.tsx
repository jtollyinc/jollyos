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
import { Bot, Check, ChevronDown, KeyRound, Loader2, Newspaper, Search, ServerCog, ShieldCheck, Sparkles, User, X } from "lucide-react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { Card, Chip, Notice } from "@/components/jolly/Foundation";
import { ALL_PICKS, CATEGORIES, CHIPS_BEFORE_MORE, SENSITIVE, searchPicks, subsOf, type FlatPick } from "@/lib/onboarding/topics";
import { GOAL_AREAS, OBSTACLES, areaById, type GoalAreaId } from "@/lib/goals/types";
import { BRIEF_LENGTHS, BRIEF_TONES, EMPTY_GOAL, MAX_WALKTHROUGH_GOALS, type BrainChoice, type WalkthroughAnswers, type WalkthroughGoal } from "@/lib/onboarding/types";
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
    </div>
  );
}

// ── 3. What you are working towards ────────────────────────────────────────

/**
 * The Goals screen. Pick up to three life areas; each one opens the same five
 * questions the Goals page asks. The hours field is the one that matters most
 * later — it is what the Coach checks the check-ins against — so it says what
 * it is for rather than just asking for a number.
 */
export function StepGoals({ answers, patch }: StepProps) {
  const goals = answers.goals;
  const chosenAreas = goals.map((g) => g.area);

  const toggleArea = (area: GoalAreaId) => {
    if (chosenAreas.includes(area)) {
      patch({ goals: goals.filter((g) => g.area !== area) });
      return;
    }
    if (goals.length >= MAX_WALKTHROUGH_GOALS) return;
    patch({ goals: [...goals, EMPTY_GOAL(area)] });
  };
  const edit = (area: GoalAreaId, partial: Partial<WalkthroughGoal>) =>
    patch({ goals: goals.map((g) => (g.area === area ? { ...g, ...partial } : g)) });

  return (
    <div className="space-y-3.5">
      <div>
        <p className="mb-1.5 text-label font-bold uppercase tracking-wider text-text-subtle">
          Which part of your life? {goals.length ? `${goals.length} of ${MAX_WALKTHROUGH_GOALS}` : ""}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {GOAL_AREAS.map((a) => {
            const on = chosenAreas.includes(a.id);
            const full = !on && goals.length >= MAX_WALKTHROUGH_GOALS;
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={on}
                disabled={full}
                onClick={() => toggleArea(a.id)}
                className={`inline-flex min-h-11 items-center rounded-full border px-3 text-[13px] font-semibold disabled:opacity-40 ${on ? "border-accent bg-accent/15 text-accent-soft" : "border-strong bg-surface-2 text-text-muted"}`}
              >
                {a.label}
              </button>
            );
          })}
        </div>
      </div>

      {goals.map((goal) => <GoalFields key={goal.area} goal={goal} edit={edit} protectedIds={answers.localOnly} />)}

      {goals.length ? null : (
        <p className="text-[13px] text-text-muted">
          Skip this if you want — but this is the part JollyOS is actually for. A goal here gets a weekly check-in and an honest read on whether it is moving.
        </p>
      )}
    </div>
  );
}

function GoalFields({ goal, edit, protectedIds }: { goal: WalkthroughGoal; edit: (area: GoalAreaId, partial: Partial<WalkthroughGoal>) => void; protectedIds: string[] }) {
  const area = areaById(goal.area)!;
  const isPrivate = Boolean(area.sensitive && protectedIds.includes(area.sensitive));
  const toggleObstacle = (id: string) =>
    edit(goal.area, { obstacles: goal.obstacles.includes(id) ? goal.obstacles.filter((x) => x !== id) : [...goal.obstacles, id] });

  return (
    <div className="space-y-2.5 rounded-control border border-accent/30 bg-surface-2/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{area.label}</span>
        {isPrivate ? <Chip tone="info">local only</Chip> : null}
      </div>
      <Field label="What exactly?">
        <input className="field" value={goal.want} onChange={(e) => edit(goal.area, { want: e.target.value })} maxLength={160} placeholder={area.example} />
      </Field>
      <Field label="Why does it matter?">
        <input className="field" value={goal.why} onChange={(e) => edit(goal.area, { why: e.target.value })} maxLength={300} placeholder="The reason that survives a bad week" />
      </Field>
      <Field label="Where are you honestly today?">
        <input className="field" value={goal.baselineNote} onChange={(e) => edit(goal.area, { baselineNote: e.target.value })} maxLength={300} placeholder="Plain words are fine" />
      </Field>
      <div>
        <p className="mb-1.5 text-label font-bold uppercase tracking-wider text-text-subtle">What usually stops you?</p>
        <div className="flex flex-wrap gap-1.5">
          {OBSTACLES.map((o) => (
            <button key={o.id} type="button" aria-pressed={goal.obstacles.includes(o.id)} onClick={() => toggleObstacle(o.id)}
              className={`inline-flex min-h-11 items-center rounded-full border px-3 text-[13px] font-semibold ${goal.obstacles.includes(o.id) ? "border-accent bg-accent/15 text-accent-soft" : "border-strong bg-surface text-text-muted"}`}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <Field label="Hours a week you can really give it" hint="Be honest, not ambitious. This is the number the Coach checks you against.">
        <input className="field" type="number" inputMode="decimal" step="0.5" min={0} max={80} value={goal.hoursClaimed}
          onChange={(e) => edit(goal.area, { hoursClaimed: e.target.value === "" ? 0 : Number(e.target.value) })} />
      </Field>
    </div>
  );
}

// ── 3. What you follow ─────────────────────────────────────────────────────

/** One selectable pill. Sub-picks are visually quieter than their chip. */
function Pill({ pick, on, onToggle, sub = false }: { pick: FlatPick; on: boolean; onToggle: () => void; sub?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={`inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-[13px] font-semibold ${
        on
          ? "border-accent bg-accent/15 text-accent-soft"
          : sub
            ? "border-subtle bg-surface text-text-muted hover:bg-surface-hover"
            : "border-strong bg-surface-2 text-text-muted hover:bg-surface-hover"
      }`}
    >
      {on ? <Check size={13} aria-hidden="true" /> : null}
      {pick.label}
    </button>
  );
}

/**
 * One collapsible category. Collapsed by default (except the first) so the
 * phone shows a short menu rather than a wall of several hundred pills, with
 * the number you have picked on the header so nothing is hidden that matters.
 */
function Category({ category, selected, toggle, startOpen }: {
  category: (typeof CATEGORIES)[number];
  selected: string[];
  toggle: (id: string) => void;
  startOpen: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [showAll, setShowAll] = useState(false);
  const bodyId = useId();
  const picked = ALL_PICKS.filter((p) => p.categoryId === category.id && selected.includes(p.id)).length;
  const chips = showAll ? category.chips : category.chips.slice(0, CHIPS_BEFORE_MORE);
  const hidden = category.chips.length - chips.length;

  return (
    <div className="rounded-control border border-subtle bg-surface-2/30">
      <h3 className="m-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="touch-target flex w-full items-center gap-2 rounded-control px-3 py-2 text-left"
        >
          <span className="min-w-0 flex-1 text-sm font-semibold">{category.label}</span>
          {picked ? <Chip tone="accent">{picked}</Chip> : null}
          <ChevronDown size={16} className={`shrink-0 text-text-subtle transition-transform ${open ? "" : "-rotate-90"}`} aria-hidden="true" />
        </button>
      </h3>
      <div id={bodyId} hidden={!open} className="px-3 pb-3">
        {open ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              {chips.map((chip) => {
                const on = selected.includes(chip.id);
                const subs = subsOf(chip.id);
                return (
                  <div key={chip.id} className={on && subs.length ? "w-full" : undefined}>
                    <Pill pick={ALL_PICKS.find((p) => p.id === chip.id)!} on={on} onToggle={() => toggle(chip.id)} />
                    {on && subs.length ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5 border-l-2 border-accent/30 pl-2.5">
                        <span className="w-full text-[11px] font-semibold uppercase tracking-wider text-text-subtle">Get specific</span>
                        {subs.map((sub) => <Pill key={sub.id} pick={sub} on={selected.includes(sub.id)} onToggle={() => toggle(sub.id)} sub />)}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {hidden > 0 ? (
              <button type="button" className="btn-quiet mt-1.5 !min-h-10 text-[13px]" onClick={() => setShowAll(true)}>
                Show {hidden} more
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

export function StepInterests({ answers, patch }: StepProps) {
  const [query, setQuery] = useState("");
  const toggle = (id: string) =>
    patch({ topics: answers.topics.includes(id) ? answers.topics.filter((t) => t !== id) : [...answers.topics, id] });
  const results = searchPicks(query);
  const searching = query.trim().length >= 2;

  return (
    <div className="space-y-3">
      <label className="relative block">
        <span className="sr-only">Search topics</span>
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle" aria-hidden="true" />
        <input
          className="field pl-9 pr-10"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${ALL_PICKS.length} topics`}
          autoCapitalize="none"
          spellCheck={false}
        />
        {query ? (
          <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="absolute right-1 top-1/2 flex h-11 w-9 -translate-y-1/2 items-center justify-center text-text-subtle hover:text-text-primary">
            <X size={16} aria-hidden="true" />
          </button>
        ) : null}
      </label>

      {searching ? (
        results.length ? (
          <ul className="space-y-1.5" aria-label="Search results">
            {results.map((pick) => (
              <li key={pick.id} className="flex items-center gap-2">
                <Pill pick={pick} on={answers.topics.includes(pick.id)} onToggle={() => toggle(pick.id)} sub={Boolean(pick.parentId)} />
                <span className="min-w-0 truncate text-[12px] text-text-subtle">
                  {pick.categoryLabel}{pick.parentLabel ? ` › ${pick.parentLabel}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-3 text-center text-[13px] text-text-muted">
            Nothing matches &ldquo;{query.trim()}&rdquo;. Put it in the box at the bottom instead — free text counts.
          </p>
        )
      ) : (
        <div className="space-y-1.5">
          {CATEGORIES.map((cat, i) => (
            <Category key={cat.id} category={cat} selected={answers.topics} toggle={toggle} startOpen={i === 0} />
          ))}
        </div>
      )}

      <Field label="Anything else?" hint="Free text. Written into your persona as-is.">
        <input className="field" value={answers.interestsText} onChange={(e) => patch({ interestsText: e.target.value })} maxLength={400} placeholder="espresso gear, sourdough, 90s sci-fi" />
      </Field>
      <p className="text-[13px] text-text-muted">
        {answers.topics.length
          ? `${answers.topics.length} picked — the specific ones decide which feeds you get, and every pick shapes how stories are ranked.`
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
