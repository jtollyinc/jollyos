import { gateModule } from "@/components/modules/ModuleGate";
import { PersonaEditor } from "@/components/modules/Persona/PersonaEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Persona" };

export default function PersonaPage() {
  const gate = gateModule("persona");
  if (gate.blocked) return gate.blocked;
  return <PersonaEditor />;
}
