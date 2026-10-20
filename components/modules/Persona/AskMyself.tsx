"use client";

/**
 * components/modules/Persona/AskMyself — pose a decision, get the answer the
 * persona would give. The receipt under every answer says which provider
 * answered, how many context items it used and how many local-only items were
 * withheld (and why).
 */
import { Loader2, RotateCcw, Sparkles } from "lucide-react";
import { useState } from "react";
import { Card, Notice, PageHeader, PageShell, Prose } from "@/components/jolly/Foundation";
import { PersonaTabs } from "./PersonaTabs";

interface AskResponse { answer: string; provider: string; model: string; used: number; withheld: number; withheldTitles: string[]; reason: string }

const EXAMPLES = [
  "Should I build this feature myself or use a library that does most of it?",
  "A free Saturday: side project, or the thing that is overdue?",
  "Pay for the better tool, or stay on the free tier?",
  "Say yes to a small client job that lands in a busy week?",
];

export function AskMyself() {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [result, setResult] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(q?: string) {
    const query = (q ?? question).trim();
    if (!query || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);
    setAsked(query);
    try {
      const res = await fetch("/api/persona/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: query }) });
      const data = (await res.json()) as AskResponse & { error?: string };
      if (!res.ok) { setError(data.error ?? "That did not work."); return; }
      setResult(data);
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell width="narrow">
      <PageHeader title="Ask Myself" lede="Pose a decision. It answers the way you would, from your persona and your past swipes." />
      <PersonaTabs />
      <div className="space-y-3">
        <textarea
          className="field resize-y"
          rows={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void ask(); }}
          placeholder="What are you trying to decide?"
          aria-label="Your question"
        />
        <div className="flex items-center gap-2">
          <button type="button" className="btn-primary" onClick={() => void ask()} disabled={loading || !question.trim()}>
            {loading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
            {loading ? "Thinking like you…" : "Ask"}
          </button>
          <span className="text-[12px] text-text-subtle">Ctrl/⌘ + Enter to send</span>
          {(result || asked) && !loading ? <button type="button" className="btn-quiet ml-auto text-[13px]" onClick={() => { setResult(null); setAsked(""); setQuestion(""); setError(null); }}><RotateCcw size={14} aria-hidden="true" />New question</button> : null}
        </div>

        {!result && !loading && !asked ? (
          <div className="space-y-2">
            <p className="text-label font-bold uppercase tracking-widest text-text-subtle">Try one</p>
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => { setQuestion(ex); void ask(ex); }} className="touch-target block w-full rounded-control border border-subtle bg-surface px-4 py-3 text-left text-sm text-text-muted hover:border-accent/40 hover:text-text-primary">{ex}</button>
            ))}
          </div>
        ) : null}

        {error ? <Notice tone="danger">{error}</Notice> : null}

        {result ? (
          <Card className="overflow-hidden">
            <div className="border-b border-subtle bg-surface-2/50 px-4 py-2 text-[13px] text-text-muted">You asked: {asked}</div>
            <div className="p-4"><Prose text={result.answer} /></div>
            <footer className="space-y-1 border-t border-subtle bg-surface-2/30 px-4 py-3 text-[12px] text-text-subtle">
              <p>Answered by {result.provider} ({result.model}) · {result.used} context items used{result.withheld ? ` · ${result.withheld} local-only withheld` : ""}.</p>
              {result.withheld ? <p className="text-warning">{result.reason}</p> : null}
            </footer>
          </Card>
        ) : null}
      </div>
    </PageShell>
  );
}
