"use client";

/**
 * components/jolly/TopBar — phone header: wordmark + who is signed in.
 * On desktop the sidebar carries both, so the bar collapses to a thin strip.
 *
 * `displayName` is what the owner asked to be called on screen two of the
 * walkthrough. It falls back to the session's name (the login) when they have
 * not said, because a login is a worse greeting than nothing at all.
 */
import Link from "next/link";
import type { Session } from "@/lib/auth";

export function TopBar({ session, displayName }: { session: Session; displayName?: string }) {
  return (
    <header className="flex min-h-12 items-center justify-between border-b border-subtle px-4 lg:hidden">
      <Link href="/" className="text-base font-bold tracking-tight">JollyOS</Link>
      <span className="truncate text-[13px] text-text-muted">{displayName || session.displayName}</span>
    </header>
  );
}
