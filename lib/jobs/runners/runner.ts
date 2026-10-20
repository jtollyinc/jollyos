/** The server-side shape every lib/jobs/runners/<id>.ts exports. */
import type { Env } from "@/lib/config";
import type { Job, RunnerManifest } from "../types";

export interface RunnerHealth {
  ok: boolean;
  status: "ready" | "needs-setup" | "unreachable";
  /** One line a human can act on. */
  detail: string;
  /** The model / CLI it would use, when it can say. */
  model: string | null;
}

export interface Runner {
  manifest: RunnerManifest;
  /** Passive and cheap (env names, a cached GET, a `which`). Never starts or loads anything. */
  health(env?: Env): Promise<RunnerHealth>;
  /** Move the job from the inbox. Resolves with the job as it stands when the synchronous part is done. */
  start(job: Job, env?: Env): Promise<Job>;
}
