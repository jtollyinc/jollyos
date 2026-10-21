/**
 * app/(app)/welcome — the first-run walkthrough.
 * Inside the authenticated group on purpose: it inherits the session gate and
 * the demo banner, and the nav stays reachable so "skip" is never a trap.
 * `?replay=1` wipes the last run and starts over (what Settings and the demo
 * link use), then redirects so a reload does not reset anything again.
 */
import { redirect } from "next/navigation";
import { Walkthrough } from "@/components/modules/Welcome/Walkthrough";
import { isDemoMode } from "@/lib/config";
import { ensureDemoSeeded } from "@/lib/demo";
import { readWalkthrough, restartWalkthrough } from "@/lib/onboarding/store";
import { publicAiSettings } from "@/lib/settings/ai";

export const dynamic = "force-dynamic";
export const metadata = { title: "Welcome" };

export default async function WelcomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  ensureDemoSeeded();
  const params = await searchParams;
  if (params.replay === "1") {
    restartWalkthrough();
    redirect("/welcome");
  }
  return <Walkthrough state={readWalkthrough()} ai={publicAiSettings()} demo={isDemoMode()} />;
}
