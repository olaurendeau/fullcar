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
  // #3, C7.2: no sideways scrolling.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await page.screenshot({ path: `var/shots/home-${width}.png`, fullPage: true });
});
