"use client";

/**
 * components/auth/PasswordRules — the live password checklist.
 * One row per rule from lib/auth/rules plus "passwords match". Every row is
 * neutral until something is typed, then green when met and red when not, so
 * the form never has to explain a rejection after the fact.
 */
import { Check, Circle, X } from "lucide-react";
import { passwordRules } from "@/lib/auth/rules";
import { cn } from "@/lib/utils";

export function PasswordRules({ password, confirm, username, className }: { password: string; confirm?: string; username?: string; className?: string }) {
  const rows: { id: string; label: string; ok: boolean }[] = passwordRules(password, username);
  if (confirm !== undefined) rows.push({ id: "match", label: "Both passwords match", ok: password.length > 0 && password === confirm });
  const typed = password.length > 0;
  return (
    <ul className={cn("space-y-1 text-[13px]", className)} aria-live="polite" aria-label="Password rules">
      {rows.map((r) => {
        const state = !typed ? "todo" : r.ok ? "ok" : "bad";
        const Icon = state === "ok" ? Check : state === "bad" ? X : Circle;
        return (
          <li key={r.id} className={cn("flex items-center gap-2", state === "ok" && "text-success", state === "bad" && "text-danger", state === "todo" && "text-text-muted")}>
            <Icon size={14} aria-hidden="true" className="shrink-0" />
            <span>{r.label}</span>
            <span className="sr-only">{state === "ok" ? " (met)" : state === "bad" ? " (not met)" : ""}</span>
          </li>
        );
      })}
    </ul>
  );
}
