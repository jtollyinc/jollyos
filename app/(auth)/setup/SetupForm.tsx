"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PasswordRules } from "@/components/auth/PasswordRules";
import { Notice } from "@/components/jolly/Foundation";
import { PASSWORD_MIN_LENGTH, validateCredentials } from "@/lib/auth/rules";

/** First-run: pick the one username and password. The rules are live; the server checks them again. */
export function SetupForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateCredentials(username, password) ?? (password !== confirm ? "Passwords do not match." : null);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) { setError(data.error ?? "Setup failed."); return; }
      router.push("/");
      router.refresh();
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <h2 className="text-lg font-semibold">Create the owner account</h2>
        <p className="mt-1 text-sm text-text-muted">This happens once. There is exactly one user: you. No default login exists.</p>
      </div>
      <label className="block space-y-1.5 text-label font-semibold uppercase tracking-wider text-text-muted">
        Username
        <input className="field" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={2} maxLength={32} />
      </label>
      <label className="block space-y-1.5 text-label font-semibold uppercase tracking-wider text-text-muted">
        Password
        <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} />
      </label>
      <label className="block space-y-1.5 text-label font-semibold uppercase tracking-wider text-text-muted">
        Confirm password
        <input className="field" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} />
      </label>
      <PasswordRules password={password} confirm={confirm} username={username} />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
    </form>
  );
}
