import { redirect } from "next/navigation";
import { ownerExists } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { SetupForm } from "./SetupForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "First-run setup" };

/** First run: choose the owner's username and password. Once. */
export default function SetupPage() {
  if (isDemoMode()) redirect("/");
  if (ownerExists()) redirect("/login");
  return <SetupForm />;
}
