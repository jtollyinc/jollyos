import { JobsBoard } from "@/components/modules/Jobs/JobsBoard";
import { gateModule } from "@/components/modules/ModuleGate";

export const dynamic = "force-dynamic";
export const metadata = { title: "Jobs" };

export default function JobsPage() {
  const gate = gateModule("jobs");
  if (gate.blocked) return gate.blocked;
  return <JobsBoard />;
}
