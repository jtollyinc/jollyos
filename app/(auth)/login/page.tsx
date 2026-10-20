import { redirect } from "next/navigation";
import { ownerExists } from "@/lib/auth";
import { getSession } from "@/lib/auth/session";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getSession()) redirect("/");
  if (!ownerExists()) redirect("/setup");
  return <LoginForm />;
}
