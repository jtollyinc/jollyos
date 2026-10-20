"use client";

/**
 * components/jolly/MobileNav — the phone bottom bar.
 * Fixed tabs, no horizontal scrolling (sideways swipes at the bottom edge
 * fight the home gesture). Everything else is in the "All" sheet.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { NavGroup, NavItem } from "@/lib/modules/registry";
import { cn } from "@/lib/utils";
import { Icon } from "./icons";
import { isActive } from "./Sidebar";

export function MobileNav({ tabs, groups }: { tabs: NavItem[]; groups: NavGroup[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Navigating closes the sheet.
  useEffect(() => {
    const close = () => setOpen(false);
    const id = window.setTimeout(close, 0);
    return () => window.clearTimeout(id);
  }, [pathname]);

  const tile = (item: NavItem, size = 20) => {
    const active = !open && isActive(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-11 flex-col items-center justify-center gap-1 rounded-control px-1 py-1.5 text-[11px] font-semibold transition-colors",
          active ? "bg-accent/[0.12] text-accent-soft" : "text-text-subtle active:text-text-muted",
        )}
      >
        <Icon name={item.icon} size={size} aria-hidden="true" />
        <span className="w-full truncate text-center">{item.label}</span>
      </Link>
    );
  };

  return (
    <div className="lg:hidden">
      {open ? <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setOpen(false)} aria-hidden="true" /> : null}
      <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col">
        {open ? (
          <div className="max-h-[65dvh] overflow-y-auto overscroll-contain rounded-t-2xl border-x border-t border-white/[0.08] bg-surface px-4 pb-2 pt-3" role="dialog" aria-label="All modules">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-label font-bold uppercase tracking-widest text-text-subtle">All modules</p>
              <button type="button" onClick={() => setOpen(false)} className="btn-quiet" aria-label="Close"><X size={18} aria-hidden="true" /></button>
            </div>
            {groups.map((group) => (
              <div key={group.label} className="mb-3">
                <p className="px-1 pb-1 text-label font-bold uppercase tracking-widest text-text-subtle/70">{group.label}</p>
                <div className="grid grid-cols-4 gap-1">{group.items.map((i) => tile(i, 22))}</div>
              </div>
            ))}
          </div>
        ) : null}
        <nav className="safe-area-pb border-t border-white/[0.08] bg-surface/90 backdrop-blur-xl" aria-label="Mobile navigation">
          <div className="grid gap-1 px-2 py-1.5" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
            {tabs.map((t) => tile(t))}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label="All modules"
              className={cn(
                "flex min-h-11 flex-col items-center justify-center gap-1 rounded-control px-1 py-1.5 text-[11px] font-semibold",
                open ? "bg-accent/[0.12] text-accent-soft" : "text-text-subtle",
              )}
            >
              <LayoutGrid size={20} aria-hidden="true" />
              All
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
}
