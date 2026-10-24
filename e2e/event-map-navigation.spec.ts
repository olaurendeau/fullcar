import type { Page } from "@playwright/test";
import { test } from "./event-map-points";
import { expect } from "./fixtures";

/*
 * #567: Leaflet's import is the page's, not the document's. Its failure on an event page, then
 * a client-side navigation away and back (« Accueil », then the browser's back): the map's
 * opening is a first attempt again, not the notice of the page left.
 */

test.use({ locale: "fr-FR" });

const ALLER_MAP = /^Carte de l’aller : /;
const FAILED = "La carte n’a pas pu se charger.";

const panel = (page: Page) => page.getByRole("tabpanel");
const mapButton = (page: Page) => panel(page).getByRole("button", { name: "Carte", exact: true });
const container = (page: Page) => page.locator('[id="event-map-aller"]');

test("a failure, then « Accueil » and back by client-side navigation: the opening asks again, and the map loads", async ({ page, placed }) => {
  await page.goto(`/e/${placed.id}`);
  await expect(panel(page)).toBeVisible();
  // What the page loads on its own is loaded: the route catches Leaflet's code alone.
  await page.waitForLoadState("networkidle");
  // Gone at a document's load: still there, the navigations were client-side.
  await page.evaluate(() => ((window as { sameDocument?: boolean }).sameDocument = true));

  await page.route("**/_next/static/**", (route) => route.fulfill({ status: 404 }));
  await mapButton(page).click();
  await expect(container(page).getByText(FAILED, { exact: true })).toBeVisible();
  await page.unroute("**/_next/static/**");

  await page.getByRole("link", { name: "Accueil", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/e/${placed.id}$`));
  await expect(panel(page)).toBeVisible();
  expect(await page.evaluate(() => (window as { sameDocument?: boolean }).sameDocument)).toBe(true);

  if ((await mapButton(page).getAttribute("aria-expanded")) !== "true") await mapButton(page).click();
  // Leaflet started in the region: the module was asked for again, and loaded.
  await expect(page.getByRole("region", { name: ALLER_MAP })).toHaveClass(/\bleaflet-container\b/);
  await expect(container(page).getByText(FAILED)).toHaveCount(0);
});
