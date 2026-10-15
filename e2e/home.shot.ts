import { expect, test } from "@playwright/test";

test("home", async ({ page }, testInfo) => {
  const width = testInfo.project.use.viewport?.width;
  const scripts: string[] = [];
  page.on("request", (r) => r.resourceType() === "script" && scripts.push(r.url()));
  await page.goto("/", { waitUntil: "networkidle" });
  // Against the production build: from this container, `next dev` blocks its own scripts
  // as cross-origin, and a capture would show a page that never hydrated (#65).
  expect(scripts.length).toBeGreaterThan(0);
  expect(scripts.filter((url) => /development|hmr-client/.test(url))).toEqual([]);
  await page.screenshot({ path: `var/shots/home-${width}.png`, fullPage: true });
});
