/**
 * lib/settings/ai — the model choice the owner made IN THE APP, on disk.
 * SERVER-SIDE ONLY (fs).
 * ────────────────────────────────────────────────────────────────────────────
 * Why this exists: a one-click zip user has no .env and no terminal, so the
 * walkthrough's "AI brain" screen has to be able to configure a model. The
 * answers land in DATA_DIR/ai-settings.json with mode 600 (same treatment as
 * owner.json and auth-secret).
 *
 * PRECEDENCE: the environment always wins. `runtimeEnv()` only fills in a
 * variable that is unset or empty, so an operator's .env / docker-compose stays
 * authoritative and nothing the UI writes can silently override it. Settings
 * shows which of the two is in effect.
 *
 * An API key VALUE never leaves this module: `publicAiSettings` returns a
 * four-character hint and a boolean, and that is what the API answers with.
 */
import type { Env } from "@/lib/config";
import { dataPath, fileExists, readJson, writeJson } from "@/lib/data-dir";
import type { BrainChoice } from "@/lib/onboarding/types";

export type ApiVendor = "anthropic" | "openai";

export interface AiSettings {
  brain: BrainChoice;
  /** Which hosted vendor the key belongs to. */
  vendor: ApiVendor;
  /** OpenAI-compatible base URL of a model on this machine. */
  localBaseUrl: string;
  localModel: string;
  /** The secret. Never returned to a client. */
  apiKey: string;
  updatedAt: string;
}

/** Everything the browser is allowed to know. No key value, ever. */
export interface PublicAiSettings {
  brain: BrainChoice;
  vendor: ApiVendor;
  localBaseUrl: string;
  localModel: string;
  apiKeySet: boolean;
  /** "…a1b2" — enough to recognise which key, useless on its own. */
  apiKeyHint: string | null;
  updatedAt: string | null;
  /** True when the environment already provides this, so the UI can say so. */
  envProvides: { apiKey: boolean; localBaseUrl: boolean };
}

const EMPTY: AiSettings = { brain: "none", vendor: "anthropic", localBaseUrl: "", localModel: "", apiKey: "", updatedAt: "" };

const file = () => dataPath("ai-settings.json");

const isBrain = (v: unknown): v is BrainChoice => v === "none" || v === "local" || v === "api";
const isVendor = (v: unknown): v is ApiVendor => v === "anthropic" || v === "openai";
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function readAiSettings(): AiSettings {
  const raw = readJson<Partial<AiSettings> | null>(file(), null);
  if (!raw) return EMPTY;
  return {
    brain: isBrain(raw.brain) ? raw.brain : "none",
    vendor: isVendor(raw.vendor) ? raw.vendor : "anthropic",
    localBaseUrl: str(raw.localBaseUrl, 300),
    localModel: str(raw.localModel, 120),
    apiKey: typeof raw.apiKey === "string" ? raw.apiKey : "",
    updatedAt: str(raw.updatedAt, 40),
  };
}

export const hasAiSettings = (): boolean => fileExists(file());

export interface AiSettingsInput {
  brain: BrainChoice;
  vendor?: ApiVendor;
  localBaseUrl?: string;
  localModel?: string;
  /** Omit (or send "") to keep the stored key; "clear" wipes it. */
  apiKey?: string;
}

export function normaliseBaseUrl(url: string): string {
  const u = url.trim().replace(/\/+$/, "");
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) throw new Error("A model URL must start with http:// or https://.");
  return u;
}

/** Writes mode 600. Returns the public view, so a caller cannot leak the key by accident. */
export function writeAiSettings(input: AiSettingsInput): PublicAiSettings {
  const current = readAiSettings();
  const next: AiSettings = {
    brain: isBrain(input.brain) ? input.brain : "none",
    vendor: isVendor(input.vendor) ? input.vendor : current.vendor,
    localBaseUrl: normaliseBaseUrl(str(input.localBaseUrl, 300) || current.localBaseUrl),
    localModel: input.localModel === undefined ? current.localModel : str(input.localModel, 120),
    apiKey: input.apiKey === undefined || input.apiKey === "" ? current.apiKey : input.apiKey === "clear" ? "" : str(input.apiKey, 400),
    updatedAt: new Date().toISOString(),
  };
  if (next.brain === "none") next.apiKey = "";
  writeJson(file(), next, 0o600);
  return publicAiSettings(next);
}

export function publicAiSettings(s: AiSettings = readAiSettings(), env: Env = process.env): PublicAiSettings {
  return {
    brain: s.brain,
    vendor: s.vendor,
    localBaseUrl: s.localBaseUrl,
    localModel: s.localModel,
    apiKeySet: s.apiKey.length > 0,
    apiKeyHint: s.apiKey ? `…${s.apiKey.slice(-4)}` : null,
    updatedAt: s.updatedAt || null,
    envProvides: {
      apiKey: Boolean((env.ANTHROPIC_API_KEY ?? "").trim() || (env.OPENAI_API_KEY ?? "").trim()),
      localBaseUrl: Boolean((env.LOCAL_LLM_BASE_URL ?? "").trim()),
    },
  };
}

/**
 * The environment every server caller should use: process.env, with the stored
 * settings filling ONLY the gaps. Pass this to providersFromEnv / configSummary
 * / defaultRunner so a model picked in the UI is really the one that answers.
 */
export function runtimeEnv(env: Env = process.env): Env {
  const s = readAiSettings();
  const out: Env = { ...env };
  const fill = (key: string, value: string) => {
    if (value && !(out[key] ?? "").trim()) out[key] = value;
  };
  if (s.brain === "local" && s.localBaseUrl) {
    fill("LOCAL_LLM_BASE_URL", s.localBaseUrl);
    fill("LOCAL_LLM_MODEL", s.localModel);
    fill("LLM_PROVIDER", "local");
  }
  if (s.brain === "api" && s.apiKey) {
    fill(s.vendor === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY", s.apiKey);
    fill("LLM_PROVIDER", s.vendor);
  }
  return out;
}
