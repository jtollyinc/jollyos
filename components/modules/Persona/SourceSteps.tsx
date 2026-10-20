"use client";

/**
 * components/modules/Persona/SourceSteps — the folded "how to export" card for
 * one source: the official steps (as the vendor states them), the official
 * links, and what the importer does with the file. Collapsed by default so the
 * page stays one screen; the data lives in lib/import/sources.
 */
import { ExternalLink } from "lucide-react";
import { CollapsibleSection } from "@/components/jolly/Foundation";
import type { SourceInfo } from "@/lib/import/sources";

export const LAST_CHECKED = "2026-10-20";

export function SourceSteps({ info }: { info: SourceInfo }) {
  return (
    <CollapsibleSection panelId={`import:steps:${info.id}`} title={`How to export from ${info.label}`} teaser={info.steps[0]} count={info.steps.length} defaultCollapsed accent="you">
      <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed">
        {info.steps.map((s) => <li key={s}>{s}</li>)}
      </ol>
      {info.official.length ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {info.official.map((o) => (
            <li key={o.url}>
              <a href={o.url} target="_blank" rel="noreferrer" className="touch-target inline-flex items-center gap-1 rounded-control border border-strong px-3 text-[13px] text-text-muted hover:text-text-primary">
                {o.label}
                <ExternalLink size={12} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 text-[12px] text-text-subtle">
        Last checked {LAST_CHECKED}. Menus change: if this differs from the official page, the official page wins. Importer: {info.importer}{" "}
        Full guide: <code>docs/importing-context.md#{info.docAnchor}</code>.
      </p>
    </CollapsibleSection>
  );
}
