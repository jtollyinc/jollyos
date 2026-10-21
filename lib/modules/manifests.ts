/**
 * lib/modules/manifests — the static list of every module in this build.
 * Next.js cannot glob at runtime, so adding a module means adding one import
 * here (docs/modules.md, step 2). Client-safe: manifests are plain data.
 */
import { briefModule } from "@/modules/brief/module";
import { goalsModule } from "@/modules/goals/module";
import { jobsModule } from "@/modules/jobs/module";
import { personaModule } from "@/modules/persona/module";
import type { ModuleManifest } from "./types";

// Goals first: it is the spine the other tools hang off.
export const MANIFESTS: readonly ModuleManifest[] = [goalsModule, jobsModule, briefModule, personaModule];
