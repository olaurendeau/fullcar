import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    environment: "node",
    // Resets `fullcar_test` and migrates it to the latest version, once per run.
    globalSetup: ["src/db/test-setup.ts"],
    // getDb() reaches `fullcar_test`, never the dev database. Empty when unset:
    // getDb() then refuses to connect instead of falling back to DATABASE_URL.
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? "" },
  },
});
