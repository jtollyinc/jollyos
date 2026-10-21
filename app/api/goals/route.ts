/**
 * GET  /api/goals   every goal with its coached reality check
 * POST /api/goals   create one
 *
 * The reality check is computed server-side because it reads check-ins, linked
 * jobs and (optionally) a model. Private goals are included here — this is the
 * owner's own screen — but lib/goals/coach decides who may be asked about them.
 */
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { ensureDemoSeeded } from "@/lib/demo";
import { coachAll } from "@/lib/goals/coach";
import { createGoal, readCheckIns, readGoals } from "@/lib/goals/store";
import { goalPrivacy, isGoalArea, type GoalAreaId } from "@/lib/goals/types";
import { doneJobsByGoal } from "@/lib/goals/match";
import { readJobs } from "@/lib/jobs/store";
import { readWalkthrough } from "@/lib/onboarding/store";
import { providersFromEnv } from "@/lib/providers";
import { runtimeEnv } from "@/lib/settings/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

async function payload(rulesOnly = false) {
  const goals = readGoals({ includePrivate: true });
  const checkIns = readCheckIns({ includePrivate: true });
  const checks = await coachAll(goals, checkIns, providersFromEnv(runtimeEnv()), doneJobsByGoal(readJobs()), rulesOnly);
  return { goals, checkIns, checks };
}

export async function GET(req: Request) {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  ensureDemoSeeded();
  const plain = new URL(req.url).searchParams.get("plain") === "1";
  return NextResponse.json(await payload(plain), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const gate = await requireSession();
  if ("response" in gate) return gate.response;
  ensureDemoSeeded();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!isGoalArea(body?.area)) return NextResponse.json({ error: "Pick a life area." }, { status: 400 });
  try {
    // The privacy tag comes from the owner's own protected categories, not
    // from the request — a browser cannot talk a goal out of being private.
    const protectedIds = readWalkthrough().answers.localOnly;
    createGoal({
      area: body.area as GoalAreaId,
      want: typeof body.want === "string" ? body.want : "",
      why: typeof body.why === "string" ? body.why : "",
      baselineNote: typeof body.baselineNote === "string" ? body.baselineNote : "",
      baseline: typeof body.baseline === "number" ? body.baseline : null,
      target: typeof body.target === "number" ? body.target : null,
      unit: typeof body.unit === "string" ? body.unit : "",
      obstacles: Array.isArray(body.obstacles) ? body.obstacles.filter((x): x is string => typeof x === "string") : [],
      obstacleNote: typeof body.obstacleNote === "string" ? body.obstacleNote : "",
      hoursClaimed: typeof body.hoursClaimed === "number" ? body.hoursClaimed : 0,
      privacy: goalPrivacy(body.area as GoalAreaId, protectedIds),
    });
    return NextResponse.json(await payload(), { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not save that goal." }, { status: 400 });
  }
}
