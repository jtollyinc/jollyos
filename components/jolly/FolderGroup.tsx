"use client";

/**
 * components/jolly/FolderGroup — a collapsible folder of cards.
 * One tile stands in for a group on a catalog page: icon, label, truthful
 * count, a one-line summary and preview chips while folded; the children in a
 * tray when open. The fold persists per panelId like CollapsibleSection.
 * `forceOpen` holds the tray open while a search is active without touching
 * the saved choice.
 */
import { ChevronDown, Search } from "lucide-react";
import { useId, type HTMLAttributes, type ReactNode } from "react";
import type { TopicAccent } from "@/lib/modules/types";
import { usePanelCollapsed } from "@/lib/use-panel-collapsed";
import { cn } from "@/lib/utils";

const PREVIEW_MAX = 6;

export interface FolderGroupProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  panelId: string;
  label: string;
  icon?: ReactNode;
  count: number;
  total?: number;
  summary?: string;
  preview?: string[];
  accent?: TopicAccent;
  defaultCollapsed?: boolean;
  forceOpen?: boolean;
  children: ReactNode;
}

export function FolderGroup({ panelId, label, icon, count, total, summary, preview = [], accent, defaultCollapsed = true, forceOpen = false, children, className, ...props }: FolderGroupProps) {
  const [saved, toggle] = usePanelCollapsed(panelId, defaultCollapsed);
  const collapsed = forceOpen ? false : saved;
  const bodyId = useId();
  const shown = preview.slice(0, PREVIEW_MAX);
  const more = Math.max(0, preview.length - PREVIEW_MAX);
  const countText = total !== undefined && total !== count ? `${count} of ${total}` : String(count);

  return (
    <section className={cn("rounded-card border border-subtle bg-surface shadow-card", accent && "topic-panel", className)} data-topic-accent={accent} data-collapsed={collapsed} {...props}>
      <h2 className="m-0">
        <button
          type="button"
          onClick={forceOpen ? undefined : toggle}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          aria-disabled={forceOpen || undefined}
          className={cn("touch-target flex w-full flex-col gap-3 rounded-card px-4 py-4 text-left font-normal sm:px-5", !forceOpen && "hover:bg-white/[0.02]")}
        >
          <span className="flex w-full items-center gap-3">
            <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", accent ? "topic-icon" : "border border-accent/20 bg-accent/[0.08] text-accent-soft")} aria-hidden="true">{icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold leading-tight">{label}</span>
              {summary && collapsed ? <span className="mt-1 block text-[13px] leading-snug text-text-muted">{summary}</span> : null}
            </span>
            <span className="flex shrink-0 items-center gap-2 text-label text-text-muted">
              <span className="rounded-full bg-surface-2 px-2 py-1 tabular-nums">{countText}</span>
              {forceOpen ? <Search size={14} aria-label="Showing search matches" /> : <ChevronDown size={16} className={cn("transition-transform", collapsed && "-rotate-90")} aria-hidden="true" />}
            </span>
          </span>
          {collapsed && shown.length ? (
            <span className="flex w-full flex-wrap gap-1.5 sm:pl-14">
              {shown.map((name) => <span key={name} className="max-w-full truncate rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] text-text-muted">{name}</span>)}
              {more > 0 ? <span className="rounded-full px-2 py-1 text-[11px] text-text-subtle">+{more} more</span> : null}
            </span>
          ) : null}
        </button>
      </h2>
      <div id={bodyId} hidden={collapsed} className="rounded-b-card border-t border-subtle bg-black/20 p-2 sm:p-4">
        {!collapsed ? children : null}
      </div>
    </section>
  );
}
