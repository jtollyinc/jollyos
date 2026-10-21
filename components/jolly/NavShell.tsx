/**
 * components/jolly/NavShell — the authenticated chrome.
 * Desktop: a left sidebar built from the module registry. Phone: a fixed
 * bottom bar with Home, up to four quick-tab modules and Settings, plus an
 * "All" sheet. The main area scrolls on its own and leaves room for the bar.
 * This is a server component: it receives nav data (plain objects) and hands
 * it to the client pieces.
 */
import type { NavGroup, NavItem } from "@/lib/modules/registry";
import type { Session } from "@/lib/auth";
import { DemoBanner } from "./DemoBanner";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export interface NavData {
  groups: NavGroup[];
  quickTabs: NavItem[];
}

export function NavShell({ nav, session, displayName, children }: { nav: NavData; session: Session; displayName?: string; children: React.ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      <Sidebar groups={nav.groups} session={session} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {session.demo ? <DemoBanner /> : null}
        <TopBar session={session} displayName={displayName} />
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto overflow-x-hidden pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-6">
          {children}
        </main>
      </div>
      <MobileNav tabs={nav.quickTabs} groups={nav.groups} />
    </div>
  );
}
