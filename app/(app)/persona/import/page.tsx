import { gateModule } from "@/components/modules/ModuleGate";
import { ImportPanel } from "@/components/modules/Persona/ImportPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Import your context" };

export default function ImportPage() {
  const gate = gateModule("persona");
  if (gate.blocked) return gate.blocked;
  return <ImportPanel />;
}
