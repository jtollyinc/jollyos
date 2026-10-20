# Writing a module

A module is a folder under `modules/<id>/` that exports a manifest, plus the
pages, API routes and components it needs. The registry turns manifests into
navigation, home tiles and a status per module. Nothing is auto-discovered:
you add one import and the rest follows.

## 1. The manifest

`modules/<id>/module.ts`:

```ts
import type { ModuleManifest } from "@/lib/modules/types";

export const weatherModule: ModuleManifest = {
  id: "weather",                 // folder name and route prefix
  label: "Weather",
  description: "Tomorrow, in one line.",
  icon: "sparkles",              // a name from components/jolly/icons.tsx
  navGroup: "Read",              // sidebar group heading
  routes: [{ href: "/weather", label: "Weather" }],
  requiredEnv: ["WEATHER_API_KEY"],  // missing → "needs setup", never a crash
  demoWaivesEnv: true,           // demo mode runs on fixtures instead
  requiredProviders: ["llm"],    // "llm" is advisory; "local-llm" blocks
  enabledByDefault: true,
  quickTab: false,               // phone bottom bar (max four modules)
  accent: "news",                // topic landmark colour
};
```

Manifests are plain data and must stay client-safe: no `fs`, no secrets, icon
by name.

## 2. Register it

Add the import to `lib/modules/manifests.ts`:

```ts
export const MANIFESTS = [jobsModule, briefModule, personaModule, weatherModule];
```

`tests/modules-registry.test.ts` checks that ids are unique and every manifest
has a landing route.

## 3. The page

`app/(app)/weather/page.tsx` calls the gate first, so a disabled module 404s
and a half-configured one shows the setup card:

```tsx
import { gateModule } from "@/components/modules/ModuleGate";
import { WeatherPanel } from "@/components/modules/Weather/WeatherPanel";

export const dynamic = "force-dynamic";

export default function WeatherPage() {
  const gate = gateModule("weather");
  if (gate.blocked) return gate.blocked;
  return <WeatherPanel />;
}
```

## 4. API routes

Put them under `app/api/<id>/`. Every handler starts with:

```ts
const gate = await requireSession();
if ("response" in gate) return gate.response;
```

Read and write state through `lib/data-dir.ts` (`dataPath`, `readJson`,
`writeJson`, `appendJsonl`). One small JSON file per concern; no database.

## 5. Talking to a model

Never pick a provider. Build tagged context and call the router:

```ts
import { completeWithContext } from "@/lib/providers";

const result = await completeWithContext({
  instructions: "You write one-line weather notes.",
  segments: personaSegments(readEntries()),  // each carries a privacy tag
  prompt: "Tomorrow: 14°C, light rain.",
  kind: "generic",
});
result.text;               // the answer
result.route.dropped;      // local-only items that were withheld (tell the user)
```

See `docs/architecture.md` for the routing rule.

## 6. Demo fixtures

If the module needs data to be interesting, add `demo/seed/<id>.json` and
write it from `lib/demo.ts` (only when the target file is missing). Keep every
seed obviously fictional.

## 7. Status rules

| State | When | What the user sees |
|---|---|---|
| `ready` | enabled, nothing missing | the page |
| `needs-setup` | enabled, a `requiredEnv` var or `local-llm` missing | sidebar mark + setup card listing exactly what to set |
| `disabled` | manifest default or the Settings toggle | not in the nav; route 404s |

Toggles live in `DATA_DIR/modules.json` and are edited from `/settings`.
