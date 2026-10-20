import { BriefPanel } from "@/components/modules/Brief/BriefPanel";
import { gateModule } from "@/components/modules/ModuleGate";

export const dynamic = "force-dynamic";
export const metadata = { title: "Daily Brief" };

export default function BriefPage() {
  const gate = gateModule("brief");
  if (gate.blocked) return gate.blocked;
  return <BriefPanel />;
}
