import { gateModule } from "@/components/modules/ModuleGate";
import { DecisionDeck } from "@/components/modules/Persona/DecisionDeck";

export const dynamic = "force-dynamic";
export const metadata = { title: "Decision Deck" };

export default function DeckPage() {
  const gate = gateModule("persona");
  if (gate.blocked) return gate.blocked;
  return <DecisionDeck />;
}
