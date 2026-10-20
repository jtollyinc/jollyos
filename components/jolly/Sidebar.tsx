"use client";

/**
 * components/jolly/Sidebar — desktop navigation from the module registry.
 * Groups come from manifests' navGroup; a "needs setup" module keeps its spot
 * with a small mark so a half-configured install never looks broken.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Settings, Wrench } from "lucide-react";
import type { Session } from "@/lib/auth";
import type { NavGroup } from "@/lib/modules/registry";
import { cn } from "@/lib/utils";
import { Icon } from "./icons";

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar({ groups, session }: { groups: NavGroup[]; session: Session }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const rowClass = (active: boolean) =>
    cn(
      "touch-target flex items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors",
      active ? "bg-accent/15 text-accent-soft shadow-[inset_2px_0_0_rgb(var(--accent-rgb))]" : "text-text-muted hover:bg-white/[0.06] hover:text-text-primary",
    );

  return (
    <aside className="hidden w-[var(--sidebar-width)] shrink-0 flex-col border-r border-subtle bg-surface/60 lg:flex" aria-label="Primary">
      <div className="px-5 pb-3 pt-5">
        <Link href="/" className="block">
          <span className="block text-label font-bold uppercase tracking-[0.2em] text-text-subtle">Personal ops</span>
          <span className="block text-xl font-bold tracking-tight">JollyOS</span>
        </Link>
      </div>
      <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-2">
        <Link href="/" className={rowClass(isActive(pathname, "/"))}>
          <Icon name="home" size={18} aria-hidden="true" />
          Home
        </Link>
        {groups.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1 text-label font-bold uppercase tracking-widest text-text-subtle">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <Link key={item.href} href={item.href} className={rowClass(isActive(pathname, item.href))} aria-current={isActive(pathname, item.href) ? "page" : undefined}>
                  <Icon name={item.icon} size={18} aria-hidden="true" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.state === "needs-setup" ? <Wrench size={14} className="text-warning" aria-label="Needs setup" /> : null}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="space-y-0.5 border-t border-subtle p-3">
        <Link href="/settings" className={rowClass(isActive(pathname, "/settings"))}>
          <Settings size={18} aria-hidden="true" />
          Settings
        </Link>
        <button type="button" onClick={() => void signOut()} className={cn(rowClass(false), "w-full")}>
          <LogOut size={18} aria-hidden="true" />
          <span className="flex-1 truncate text-left">{session.demo ? "Exit demo session" : `Sign out ${session.username}`}</span>
        </button>
      </div>
    </aside>
  );
}
