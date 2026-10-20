"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Notice } from "@/components/jolly/Foundation";

export function SetupForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords do not match."); return; }
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
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Create the owner account</h2>
        <p className="mt-1 text-sm text-text-muted">This happens once. There is exactly one user: you.</p>
      </div>
      <label className="block space-y-1.5 text-label font-semibold uppercase tracking-wider text-text-muted">
        Username
        <input className="field" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required minLength={2} maxLength={32} />
      </label>
      <label className="block space-y-1.5 text-label font-semibold uppercase tracking-wider text-text-muted">
        Password
        <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required minLength={8} />
      </label>
      <label className="block space-y-1.5 text-label font-semibold uppercase tracking-wider text-text-muted">
        Confirm password
        <input className="field" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required minLength={8} />
      </label>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
    </form>
  );
}
