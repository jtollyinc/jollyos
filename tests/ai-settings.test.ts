/**
 * The AI brain the owner chose in the UI: where the secret lives, who may see
 * it, and who wins when the environment says something different.
 *
 * The point of these tests is the blast radius of a mistake here — an API key
 * echoed back to a browser, or a world-readable file in DATA_DIR.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultRunner } from "@/lib/config";
import { hasAiSettings, publicAiSettings, readAiSettings, runtimeEnv, writeAiSettings } from "@/lib/settings/ai";
import { providersFromEnv } from "@/lib/providers";

const KEY = "sk-test-not-a-real-key-0000-abcd";
let dir: string;
const file = () => path.join(dir, "ai-settings.json");

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "jollyos-ai-"));
  process.env.DATA_DIR = dir;
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  for (const k of ["DATA_DIR", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "LOCAL_LLM_BASE_URL", "LOCAL_LLM_MODEL", "LLM_PROVIDER"]) delete process.env[k];
});

describe("storing the model choice", () => {
  it("defaults to none with nothing on disk", () => {
    expect(hasAiSettings()).toBe(false);
    const ai = publicAiSettings();
    expect(ai.brain).toBe("none");
    expect(ai.apiKeySet).toBe(false);
    expect(ai.apiKeyHint).toBeNull();
  });

  it("writes the key mode 600, and only the owner can read it", () => {
    writeAiSettings({ brain: "api", vendor: "anthropic", apiKey: KEY });
    const mode = fs.statSync(file()).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("never returns the key — a hint and a boolean, nothing else", () => {
    const ai = writeAiSettings({ brain: "api", vendor: "openai", apiKey: KEY });
    expect(JSON.stringify(ai)).not.toContain(KEY);
    expect(ai.apiKeySet).toBe(true);
    expect(ai.apiKeyHint).toBe("…abcd");
    expect(ai.vendor).toBe("openai");
    // ...while the server itself can still read it.
    expect(readAiSettings().apiKey).toBe(KEY);
  });

  it("an empty key means 'keep the one I saved', not 'wipe it'", () => {
    writeAiSettings({ brain: "api", apiKey: KEY });
    writeAiSettings({ brain: "api", apiKey: "" });
    expect(readAiSettings().apiKey).toBe(KEY);
  });

  it("'clear' wipes it, and so does going back to none", () => {
    writeAiSettings({ brain: "api", apiKey: KEY });
    expect(writeAiSettings({ brain: "api", apiKey: "clear" }).apiKeySet).toBe(false);
    writeAiSettings({ brain: "api", apiKey: KEY });
    expect(writeAiSettings({ brain: "none" }).apiKeySet).toBe(false);
    expect(readAiSettings().apiKey).toBe("");
  });

  it("refuses a local URL that is not a URL", () => {
    expect(() => writeAiSettings({ brain: "local", localBaseUrl: "localhost:1234" })).toThrow(/http/);
  });

  it("trims a trailing slash so /v1/ and /v1 are the same server", () => {
    expect(writeAiSettings({ brain: "local", localBaseUrl: "http://127.0.0.1:1234/v1/" }).localBaseUrl).toBe("http://127.0.0.1:1234/v1");
  });

  it("survives a corrupt file", () => {
    fs.writeFileSync(file(), "nonsense");
    expect(readAiSettings().brain).toBe("none");
  });
});

describe("precedence: the environment always wins", () => {
  it("a stored key fills an empty environment", () => {
    writeAiSettings({ brain: "api", vendor: "anthropic", apiKey: KEY });
    const env = runtimeEnv({});
    expect(env.ANTHROPIC_API_KEY).toBe(KEY);
    expect(env.LLM_PROVIDER).toBe("anthropic");
    expect(providersFromEnv(env).default.id).toBe("anthropic");
  });

  it("a stored key does NOT override one set in the environment", () => {
    writeAiSettings({ brain: "api", vendor: "anthropic", apiKey: KEY });
    const env = runtimeEnv({ ANTHROPIC_API_KEY: "from-the-env" });
    expect(env.ANTHROPIC_API_KEY).toBe("from-the-env");
  });

  it("an empty environment variable counts as unset, not as an override", () => {
    writeAiSettings({ brain: "local", localBaseUrl: "http://127.0.0.1:1234/v1" });
    expect(runtimeEnv({ LOCAL_LLM_BASE_URL: "   " }).LOCAL_LLM_BASE_URL).toBe("http://127.0.0.1:1234/v1");
  });

  it("a local model chosen in the UI becomes the router's local slot", () => {
    writeAiSettings({ brain: "local", localBaseUrl: "http://127.0.0.1:1234/v1", localModel: "small-model" });
    const providers = providersFromEnv(runtimeEnv({}));
    expect(providers.local).not.toBeNull();
    expect(providers.local!.kind).toBe("local");
    expect(providers.default.id).toBe("local");
  });

  it("brain=none leaves the environment exactly as it was", () => {
    writeAiSettings({ brain: "none" });
    expect(runtimeEnv({})).toEqual({});
    expect(providersFromEnv(runtimeEnv({})).default.id).toBe("demo");
  });

  it("a key chosen in the UI also decides what the Jobs board's Auto means", () => {
    expect(defaultRunner(runtimeEnv({}))).toBe("demo");
    writeAiSettings({ brain: "api", vendor: "openai", apiKey: KEY });
    expect(defaultRunner(runtimeEnv({}))).toBe("api");
  });

  it("reports when the environment already provides a model, so the UI can say so", () => {
    expect(publicAiSettings(readAiSettings(), {}).envProvides).toEqual({ apiKey: false, localBaseUrl: false });
    expect(publicAiSettings(readAiSettings(), { OPENAI_API_KEY: "x" }).envProvides.apiKey).toBe(true);
    expect(publicAiSettings(readAiSettings(), { LOCAL_LLM_BASE_URL: "http://localhost:1234/v1" }).envProvides.localBaseUrl).toBe(true);
  });
});
