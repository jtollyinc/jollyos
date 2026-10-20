/**
 * components/modules/ModuleGate — server helper every module page calls:
 * disabled → 404, needs-setup → the setup card, ready → render the page.
 */
import { notFound } from "next/navigation";
import { getModuleStatus } from "@/lib/modules/registry";
import { NeedsSetup } from "./NeedsSetup";

export function gateModule(id: string): { blocked: React.ReactNode } | { blocked: null } {
  const status = getModuleStatus(id);
  if (!status || status.state === "disabled") notFound();
  if (status.state === "needs-setup") return { blocked: <NeedsSetup status={status} /> };
  return { blocked: null };
}
