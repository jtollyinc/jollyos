/** POST /api/import/sample — demo mode only: queue the fictional sample exports (rule-based, no raw copies). */
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/config";
import { ensureDemoSeeded } from "@/lib/demo";
import { queueCounts } from "@/lib/import/queue";
import { importSamples } from "@/lib/import/samples";

export const runtime = "nodejs";

export async function POST() {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  if (!isDemoMode()) return NextResponse.json({ error: "Sample data is only available in demo mode." }, { status: 403 });
  ensureDemoSeeded();
  const results = await importSamples();
  const added = results.reduce((n, r) => n + (r.status === 201 ? r.body.added.length : 0), 0);
  const warnings = results.flatMap((r) => (r.status === 201 ? r.body.warnings : [r.body.error]));
  return NextResponse.json({ added, batches: results.length, warnings, counts: queueCounts() }, { status: 201 });
}
