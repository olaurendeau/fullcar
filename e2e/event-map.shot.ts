import type { Page, TestInfo } from "@playwright/test";
import { arriveWaiting, idle, mapName, openMap, points, seedParking, test } from "./event-map-points";
import { expect } from "./fixtures";
import { answerTiles, tileAt } from "./tiles";

/*
 * #484, event-map v18: the design's states at WIDTH px, 360 by default, at touch; from 1024 px,
 * with a mouse, as « À 1280 px » draws it. Folded, open, the bubble, the tiles' notice and
 * Leaflet's. `make shot SLOT=… WIDTH=360`, then `WIDTH=1280`. Each capture waits for the state
 * it shows. The fake tile provider is set for one tile only, the flag's, in the tiles' notice.
 */

const desk = Number(process.env.SHOT_WIDTH ?? 360) >= 1024;
// The full Chromium, as the project `e2e`: the headless shell does not take a Pixel 7 for a
// touch screen, and the map reads `(pointer: coarse)` for its two-finger sentence.
test.use({ locale: "fr-FR", ...(desk ? { isMobile: false, hasTouch: false } : { channel: "chromium" }) });

/** The zoom of `seedParking`'s view. */
const ZOOM = 15;
const NAME = mapName("aller", "3 voitures");
const GROUP = "2 voitures : Nina, Paul";

/**
 * With a mouse, the whole page. At touch, the screen, from « Carte » unless the map is folded:
 * a full-page capture emulates a taller screen, without touch, and the two-finger sentence goes.
 */
async function shoot(page: Page, testInfo: TestInfo, name: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${name} scrolls sideways`).toBe(0);
  const open = (await mapButton(page).getAttribute("aria-expanded")) === "true";
  // From the top of le conteneur, its border included (#562).
  if (!desk && open) await mapButton(page).evaluate((button) => button.parentElement!.scrollIntoView({ block: "start" }));
  await page.screenshot({
    path: `var/shots/${name}-${testInfo.project.use.viewport?.width}.png`,
    fullPage: desk,
    animations: "disabled",
    mask: [page.getByTestId("link")],
  });
}

const container = (page: Page) => page.locator('[id="event-map-aller"]');
const mapButton = (page: Page) => page.getByRole("tabpanel").getByRole("button", { name: "Carte", exact: true });

const TOUCH_HINT = "Deux doigts pour déplacer ou zoomer la carte.";

test.beforeEach(({ db, placed }) => seedParking(db, placed.id, placed.place));

test("the map, folded, open, then its bubble", async ({ page, placed }, testInfo) => {
  await page.goto(`/e/${placed.id}`, { waitUntil: "networkidle" });
  // Open at the arrival (#653): folded by a tap.
  await mapButton(page).click();
  await expect(mapButton(page)).toHaveAttribute("aria-expanded", "false");
  await shoot(page, testInfo, "carte-repliee");

  const map = await openMap(page, NAME);
  await expect(points(map)).toHaveCount(2);
  await expect(map.locator(`img.leaflet-tile-loaded[src^="/tuiles/${ZOOM}/"]`).first()).toBeVisible();
  await expect(map.locator("img.leaflet-tile:not(.leaflet-tile-loaded)")).toHaveCount(0);
  await expect(container(page).getByText(TOUCH_HINT, { exact: true })).toBeVisible({ visible: !desk });
  await shoot(page, testInfo, "carte-ouverte");

  await map.getByRole("button", { name: GROUP, exact: true }).click();
  await expect(map.getByRole("group", { name: GROUP, exact: true }).getByRole("button")).toHaveText(["Voiture de Nina", "Voiture de Paul", "Fermer"]);
  await shoot(page, testInfo, "carte-bulle");
});

test("the map, a tile in error: the tiles' notice", async ({ page, placed }, testInfo) => {
  await answerTiles([tileAt(placed.place, ZOOM)], { kind: "error" });
  await page.goto(`/e/${placed.id}`, { waitUntil: "networkidle" });
  const map = await openMap(page, NAME);
  await expect(container(page).getByText("Le fond de carte n’a pas pu se charger.", { exact: true })).toBeVisible();
  await expect(points(map)).toHaveCount(2);
  await shoot(page, testInfo, "carte-tuiles-echec");
});

test("the map, Leaflet's code refused: its notice", async ({ page, placed }, testInfo) => {
  // The map not started until `settle`; as an old build's chunk after a deploy: what the page loads on its own is loaded.
  const settle = await arriveWaiting(page, placed.id);
  await page.waitForLoadState("load");
  await idle(page);
  await page.route("**/_next/static/**", (route) => route.fulfill({ status: 404 }));
  settle();
  await expect(container(page).getByText("La carte n’a pas pu se charger.", { exact: true })).toBeVisible();
  await shoot(page, testInfo, "carte-leaflet-echec");
});
