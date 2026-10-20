/**
 * app/(app)/layout — the gate and the chrome for every dashboard page.
 * proxy.ts already redirected anonymous visitors; this layout double-checks
 * the session (defence in depth), seeds demo data on first start and builds
 * the navigation from the module registry.
 */
import { redirect } from "next/navigation";
import { NavShell } from "@/components/jolly/NavShell";
import { ownerExists } from "@/lib/auth";
import { getSession } from "@/lib/auth/session";
import { ensureDemoSeeded } from "@/lib/demo";
import { loadStatuses, navGroups, quickTabs } from "@/lib/modules/registry";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect(ownerExists() ? "/login" : "/setup");
  ensureDemoSeeded();
  const statuses = loadStatuses();
  return (
    <NavShell nav={{ groups: navGroups(statuses), quickTabs: quickTabs(statuses) }} session={session}>
      {children}
    </NavShell>
  );
}
