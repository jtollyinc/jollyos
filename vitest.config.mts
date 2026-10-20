import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests live in tests/ and run in plain Node: no DOM, no Next runtime.
// The "@/" alias mirrors tsconfig so tests import the same modules the app does.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
