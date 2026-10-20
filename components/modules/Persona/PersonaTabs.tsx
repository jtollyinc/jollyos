"use client";

/** Sub-navigation shared by the three persona pages. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/persona", label: "Persona" },
  { href: "/persona/ask", label: "Ask Myself" },
  { href: "/persona/deck", label: "Decision Deck" },
];

export function PersonaTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Persona sections" className="mb-4 flex gap-1 overflow-x-auto scrollbar-hidden rounded-control border border-subtle bg-surface p-1">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={cn("touch-target flex flex-1 items-center justify-center whitespace-nowrap rounded-[0.6rem] px-3 text-sm font-semibold", active ? "bg-accent/15 text-accent-soft" : "text-text-muted hover:bg-white/[0.04]")}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
