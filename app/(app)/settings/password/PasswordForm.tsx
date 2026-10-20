"use client";

/**
 * The change-password form: current password, new password twice, the live
 * rule checklist, one error line, and a finished state instead of a toast.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PasswordRules } from "@/components/auth/PasswordRules";
import { Notice } from "@/components/jolly/Foundation";
import { PASSWORD_MIN_LENGTH, passwordProblem } from "@/lib/auth/rules";

export function PasswordForm({ username }: { username: string }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!current) { setError("Enter your current password."); return; }
    const problem = passwordProblem(next, username) ?? (next !== confirm ? "Passwords do not match." : null);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current, next }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not change the password.");
        if (res.status === 403) setCurrent("");
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4">
        <Notice tone="success">
          <strong>Password changed.</strong> Every other browser and device is signed out. You are still signed in here.
        </Notice>
        <div className="flex flex-wrap gap-2">
          <Link href="/settings" className="btn-primary">Back to Settings</Link>
          <button type="button" className="btn-ghost" onClick={() => { setDone(false); setCurrent(""); setNext(""); setConfirm(""); }}>Change it again</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <input type="text" name="username" value={username} autoComplete="username" readOnly hidden aria-hidden="true" tabIndex={-1} />
      <label className="block space-y-1.5 text-label font-semibold uppercase tracking-wider text-text-muted">
        Current password
        <input className="field" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
      </label>
      <label className="block space-y-1.5 text-label font-semibold uppercase tracking-wider text-text-muted">
        New password
        <input className="field" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} />
      </label>
      <label className="block space-y-1.5 text-label font-semibold uppercase tracking-wider text-text-muted">
        Confirm new password
        <input className="field" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} />
      </label>
      <PasswordRules password={next} confirm={confirm} username={username} />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <button type="submit" className="btn-primary w-full sm:w-auto" disabled={busy}>{busy ? "Changing…" : "Change password"}</button>
    </form>
  );
}
