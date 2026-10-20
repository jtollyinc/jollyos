/** A banner that is on every page in demo mode: the data is fictional. */
export function DemoBanner() {
  return (
    <div role="note" className="flex min-h-10 items-center justify-center gap-2 border-b border-warning/30 bg-warning/10 px-3 text-center text-[13px] font-medium text-warning">
      Demo data — fictional. Nothing here is a real person; nothing leaves this machine.
    </div>
  );
}
