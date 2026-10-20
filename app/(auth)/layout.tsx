/** Centred card for the public entry pages (setup, login). */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-label font-bold uppercase tracking-[0.2em] text-text-subtle">Personal ops</p>
          <h1 className="text-2xl font-bold tracking-tight">JollyOS</h1>
        </div>
        <div className="rounded-card border border-subtle bg-surface p-5 shadow-card sm:p-6">{children}</div>
      </div>
    </div>
  );
}
