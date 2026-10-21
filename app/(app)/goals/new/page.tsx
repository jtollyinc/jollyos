import { gateModule } from "@/components/modules/ModuleGate";
import { NewGoalForm } from "@/components/modules/Goals/NewGoalForm";
import { readWalkthrough } from "@/lib/onboarding/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "New goal" };

export default function NewGoalPage() {
  const gate = gateModule("goals");
  if (gate.blocked) return gate.blocked;
  return <NewGoalForm protectedAreas={readWalkthrough().answers.localOnly} />;
}
