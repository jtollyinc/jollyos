"use client";

/** Sub-navigation shared by the three persona pages. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** `short` is the phone label: four tabs have to fit a 390px row. */
const TABS = [
  { href: "/persona", label: "Persona", short: "Persona" },
  { href: "/persona/ask", label: "Ask Myself", short: "Ask" },
  { href: "/persona/deck", label: "Decision Deck", short: "Deck" },
  { href: "/persona/import", label: "Import", short: "Import" },
];

export function PersonaTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Persona sections" className="mb-4 flex gap-1 overflow-x-auto scrollbar-hidden rounded-control border border-subtle bg-surface p-1">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} aria-label={t.label} className={cn("touch-target flex flex-1 items-center justify-center whitespace-nowrap rounded-[0.6rem] px-2 text-sm font-semibold sm:px-3", active ? "bg-accent/15 text-accent-soft" : "text-text-muted hover:bg-white/[0.04]")}>
            <span className="sm:hidden">{t.short}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
