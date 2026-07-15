import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Live smoke suite config. Runs in a node environment (real `fetch` against a
 * running server) and only picks up `*.smoke.test.ts`. Opt-in via
 * `SMOKE_BASE_URL`; without it the suite is a no-op green guard.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["**/*.smoke.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**"],
  },
});
