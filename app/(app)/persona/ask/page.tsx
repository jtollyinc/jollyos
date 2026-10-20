import { gateModule } from "@/components/modules/ModuleGate";
import { AskMyself } from "@/components/modules/Persona/AskMyself";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ask Myself" };

export default function AskPage() {
  const gate = gateModule("persona");
  if (gate.blocked) return gate.blocked;
  return <AskMyself />;
}
