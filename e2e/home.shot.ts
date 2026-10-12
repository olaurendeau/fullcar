import { test } from "@playwright/test";

test("home", async ({ page }, testInfo) => {
  const width = testInfo.project.use.viewport?.width;
  await page.goto("/");
  await page.screenshot({ path: `var/shots/home-${width}.png`, fullPage: true });
});
