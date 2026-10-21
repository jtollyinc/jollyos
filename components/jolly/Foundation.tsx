"use client";

/**
 * components/jolly/Foundation — the design-system primitives.
 * ────────────────────────────────────────────────────────────────────────────
 * Every page is built from these: Card, PageShell, PageHeader, the
 * CollapsibleSection that remembers its fold, HeroStrip for the one loud
 * thing, ToolTile for the home grid, StoryCard for feed items, plus small
 * Chip / Notice / EmptyState helpers. Rules they enforce (docs/design-system.md):
 * 44px tap targets, one accent, sections fold to a truthful one-liner, no
 * status colours for landmarks.
 */
import Link from "next/link";
import { ArrowRight, ChevronDown, type LucideIcon } from "lucide-react";
import { useId, type HTMLAttributes, type ReactNode } from "react";
import type { HelpTopic } from "@/lib/help";
import type { TopicAccent } from "@/lib/modules/types";
import { HelpButton } from "./HelpButton";
import { usePanelCollapsed } from "@/lib/use-panel-collapsed";
import { ago, cn } from "@/lib/utils";

type BoxProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: BoxProps) {
  return <div className={cn("rounded-card border border-subtle bg-surface shadow-card", className)} {...props} />;
}

export function PageShell({ width = "wide", className, ...props }: BoxProps & { width?: "wide" | "narrow" }) {
  return <div className={cn(width === "wide" ? "page-shell" : "page-shell-narrow", className)} {...props} />;
}

/**
 * Every page's title row. `help` adds the (?) beside the title and, when no
 * `lede` is given, uses the topic's own one-liner — so "what is this page?"
 * is answered on every screen by passing one prop (lib/help).
 */
export function PageHeader({ title, lede, help, children, className }: { title: string; lede?: string; help?: HelpTopic; children?: ReactNode; className?: string }) {
  const line = lede ?? help?.line;
  return (
    <header className={cn("mb-4 flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <h1 className="text-xl font-bold lg:text-2xl">{title}</h1>
          {help ? <HelpButton topic={help} className="-my-2" /> : null}
        </div>
        {line ? <p className="mt-1 text-sm text-text-muted">{line}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </header>
  );
}

export interface CollapsibleSectionProps extends BoxProps {
  /** Stable, namespaced id — the fold state is saved under it. */
  panelId: string;
  title: string;
  icon?: ReactNode;
  count?: number;
  defaultCollapsed?: boolean;
  /** One truthful line shown while folded. */
  teaser?: string;
  accent?: TopicAccent;
}

/** A card that folds to one line and remembers the choice. */
export function CollapsibleSection({ panelId, title, icon, count, defaultCollapsed = true, teaser, accent, children, className, ...props }: CollapsibleSectionProps) {
  const [collapsed, toggle] = usePanelCollapsed(panelId, defaultCollapsed);
  const bodyId = useId();
  return (
    <Card className={cn(accent && "topic-panel", className)} data-topic-accent={accent} data-collapsed={collapsed} {...props}>
      <h2 className="m-0">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          className="touch-target flex w-full items-center gap-3 rounded-card px-4 py-3 text-left hover:bg-white/[0.02] sm:px-5"
        >
          {icon ? <span className={cn("shrink-0", accent ? "topic-icon" : "text-accent-soft")} aria-hidden="true">{icon}</span> : null}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-text-primary">{title}</span>
            {teaser && collapsed ? <span className="mt-0.5 block truncate text-[13px] font-normal text-text-muted">{teaser}</span> : null}
          </span>
          <span className="flex shrink-0 items-center gap-2 text-label text-text-muted">
            {count !== undefined ? <span className="rounded-full bg-surface-2 px-2 py-1 tabular-nums">{count}</span> : null}
            <ChevronDown size={16} className={cn("transition-transform", collapsed && "-rotate-90")} aria-hidden="true" />
          </span>
        </button>
      </h2>
      <div id={bodyId} hidden={collapsed} className="px-4 pb-4 sm:px-5 sm:pb-5">
        {!collapsed ? children : null}
      </div>
    </Card>
  );
}

/** The one loud thing on a page. */
export function HeroStrip({ title, icon, action, children, className }: { title: string; icon?: ReactNode; action?: { href: string; label: string } | null; children: ReactNode; className?: string }) {
  return (
    <Card className={cn("mb-4 border-accent/25 bg-accent/[0.06] px-4 py-4 sm:px-5 lg:px-6", className)}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
        <div className="min-w-0 flex-1">
          <h2 className="mb-1.5 flex items-center gap-1.5 text-label font-bold uppercase tracking-widest text-accent-soft">{icon}{title}</h2>
          <div className="text-[15px] leading-relaxed text-text-primary lg:text-[17px]">{children}</div>
        </div>
        {action ? (
          <Link href={action.href} className="btn-primary self-start lg:self-center">
            {action.label}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </Card>
  );
}

export function ToolTile({ href, title, icon, badge, children }: { href: string; title: string; icon: ReactNode; badge?: ReactNode; children?: ReactNode }) {
  return (
    <Link href={href} className="touch-target block rounded-card border border-subtle bg-surface p-4 hover:bg-surface-hover sm:p-5">
      <span className="flex items-start justify-between gap-2">
        <span className="text-accent-soft" aria-hidden="true">{icon}</span>
        {badge}
      </span>
      <span className="mt-2 block text-sm font-semibold">{title}</span>
      {children ? <span className="mt-1 block text-sm text-text-muted">{children}</span> : null}
    </Link>
  );
}

export function StoryCard({ title, href, source, date, children }: { title: string; href: string; source?: string; date?: string | null; children?: ReactNode }) {
  const when = date ? ago(date) : "";
  return (
    <article className="rounded-control border border-subtle bg-surface-2/40 p-3 sm:p-4">
      <p className="mb-1 text-label text-text-muted">
        {source}
        {when ? <> &middot; <time dateTime={date ?? undefined}>{when}</time></> : null}
      </p>
      <h3 className="text-[15px] font-semibold leading-snug">
        <a href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center hover:text-accent-soft">{title}</a>
      </h3>
      {children ? <div className="mt-1 text-sm leading-relaxed text-text-muted">{children}</div> : null}
    </article>
  );
}

export type ChipTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const CHIP_TONES: Record<ChipTone, string> = {
  neutral: "bg-surface-2 text-text-muted",
  accent: "bg-accent/15 text-accent-soft",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
  info: "bg-info/15 text-info",
};

export function Chip({ tone = "neutral", icon: IconCmp, className, children }: { tone?: ChipTone; icon?: LucideIcon; className?: string; children: ReactNode }) {
  return (
    <span className={cn("chip", CHIP_TONES[tone], className)}>
      {IconCmp ? <IconCmp size={11} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "warning" | "danger" | "success"; children: ReactNode; className?: string }) {
  const tones = {
    info: "border-info/30 bg-info/10 text-text-primary",
    warning: "border-warning/30 bg-warning/10 text-text-primary",
    danger: "border-danger/30 bg-danger/10 text-text-primary",
    success: "border-success/30 bg-success/10 text-text-primary",
  };
  return <div role="status" className={cn("rounded-control border px-3 py-2.5 text-sm leading-relaxed", tones[tone], className)}>{children}</div>;
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-strong px-4 py-8 text-center">
      <p className="text-sm font-semibold">{title}</p>
      {children ? <p className="mx-auto mt-1 max-w-md text-sm text-text-muted">{children}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/** Minimal markdown: paragraphs, "- " bullets, **bold** and _italic_. */
export function Prose({ text, className }: { text: string; className?: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className={cn("space-y-2 text-sm leading-relaxed text-text-primary", className)}>
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => l.trim().startsWith("- "))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => <li key={j}>{inline(l.trim().slice(2))}</li>)}
            </ul>
          );
        }
        return <p key={i}>{lines.map((l, j) => <span key={j}>{j > 0 ? <br /> : null}{inline(l)}</span>)}</p>;
      })}
    </div>
  );
}

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|_[^_]+_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("**")) out.push(<strong key={k++}>{token.slice(2, -2)}</strong>);
    else out.push(<em key={k++} className="text-text-muted">{token.slice(1, -1)}</em>);
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
