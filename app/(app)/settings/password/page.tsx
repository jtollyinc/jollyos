import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, Notice, PageHeader, PageShell } from "@/components/jolly/Foundation";
import { getSession } from "@/lib/auth/session";
import { PasswordForm } from "./PasswordForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Password" };

/** Settings → Password: change the owner's password. Signs every other browser out. */
export default async function PasswordPage() {
  const session = (await getSession())!;
  return (
    <PageShell width="narrow">
      <PageHeader title="Password" lede="Changing it signs out every other browser and device. This one stays signed in.">
        <Link href="/settings" className="btn-ghost">
          <ArrowLeft size={14} aria-hidden="true" />
          Settings
        </Link>
      </PageHeader>
      <Card className="p-4 sm:p-5">
        {session.demo ? (
          <Notice tone="info">Demo mode has no owner account and no password. Run JollyOS without <code>DEMO_MODE</code> to create one.</Notice>
        ) : (
          <PasswordForm username={session.username} />
        )}
      </Card>
    </PageShell>
  );
}
