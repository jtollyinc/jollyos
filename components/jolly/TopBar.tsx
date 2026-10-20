"use client";

/**
 * components/jolly/TopBar — phone header: wordmark + who is signed in.
 * On desktop the sidebar carries both, so the bar collapses to a thin strip.
 */
import Link from "next/link";
import type { Session } from "@/lib/auth";

export function TopBar({ session }: { session: Session }) {
  return (
    <header className="flex min-h-12 items-center justify-between border-b border-subtle px-4 lg:hidden">
      <Link href="/" className="text-base font-bold tracking-tight">JollyOS</Link>
      <span className="truncate text-[13px] text-text-muted">{session.displayName}</span>
    </header>
  );
}
