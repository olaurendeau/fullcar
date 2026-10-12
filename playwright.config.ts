import { defineConfig, devices } from "@playwright/test";

// Runs in the `e2e` container against the slot's app (see compose.yaml and the Makefile).
const baseURL = process.env.BASE_URL ?? "http://localhost:3000";
const width = Number(process.env.SHOT_WIDTH ?? 360);

export default defineConfig({
  testDir: "./e2e",
  outputDir: "var/test-results",
  reporter: process.env.CI ? "github" : "list",
  forbidOnly: !!process.env.CI,
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    {
      name: "e2e",
      testIgnore: /\.shot\.ts$/,
      // 360 px is the reference width, not an edge case.
      use: { ...devices["Pixel 7"], viewport: { width: 360, height: 780 } },
    },
    {
      name: "shot",
      testMatch: /\.shot\.ts$/,
      use: { ...devices["Pixel 7"], viewport: { width, height: 780 } },
    },
  ],
});
