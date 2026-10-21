import { gateModule } from "@/components/modules/ModuleGate";
import { GoalsPanel } from "@/components/modules/Goals/GoalsPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Goals" };

export default function GoalsPage() {
  const gate = gateModule("goals");
  if (gate.blocked) return gate.blocked;
  return <GoalsPanel />;
}
