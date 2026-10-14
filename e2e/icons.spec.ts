import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/** Each icon of #96: the link that names it, its file, and the type it is served with. */
const ICONS = [
  { name: "favicon", link: 'link[rel="icon"][href^="/favicon.ico"]', path: /^\/favicon\.ico$/, type: "image/x-icon" },
  { name: "icon", link: 'link[rel="icon"][href^="/icon.svg"]', path: /^\/icon\.svg$/, type: "image/svg+xml" },
  {
    name: "apple icon",
    link: 'link[rel="apple-touch-icon"][href^="/apple-icon.png"]',
    path: /^\/apple-icon\.png$/,
    type: "image/png",
  },
];

/** The page references every icon, and each one answers 200 with its own type. */
async function expectIcons(page: Page) {
  for (const icon of ICONS) {
    const link = page.locator(icon.link);
    await expect(link, icon.name).toHaveCount(1);
    const href = await link.getAttribute("href");
    expect(new URL(href!, page.url()).pathname, icon.name).toMatch(icon.path);

    const response = await page.request.get(href!);
    expect(response.status(), icon.name).toBe(200);
    expect(response.headers()["content-type"], icon.name).toBe(icon.type);
    expect((await response.body()).length, icon.name).toBeGreaterThan(0);
  }
}

test.describe("icons", () => {
  test("the home page references the favicon, the icon and the Apple icon, all served", async ({ page }) => {
    await page.goto("/");
    await expectIcons(page);
  });

  test("an event page references the favicon, the icon and the Apple icon, all served", async ({
    page,
    seededEvent,
  }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expectIcons(page);
  });
});
