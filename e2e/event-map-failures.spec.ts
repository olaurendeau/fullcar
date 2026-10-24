import type { Locator, Page, Route } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import type { SeededEvent } from "@/db/test-events";
import type { Position } from "@/domain/place";
import { contrast } from "./contrast";
import { around, points, seedCar, test } from "./event-map-points";
import { expect } from "./fixtures";
import { answerTiles, requestsForTile, tileAt, type IgnAnswer } from "./ign";

/*
 * #483, event-map v15: the map's loading and its failures, « Le chargement », « Des tuiles en
 * échec » and « Leaflet ne se charge pas ». Leaflet's code is held or answered 404 by the test,
 * as an old build's chunk is after a deploy. The fake IGN is set for one tile only, the one
 * the test checks: the flag's, at the zoom of the view (#238, the fake IGN's capacity).
 */

test.use({ locale: "fr-FR" });

const ALLER_MAP = /^Carte de l’aller : /;
const LOADING = "Chargement de la carte…";
const FAILED = "La carte n’a pas pu se charger.";
const TILES_FAILED = "Le fond de carte n’a pas pu se charger.";
const BODY = "Vérifiez la connexion, puis réessayez.";
const NOT_ON_MAP = "1 voiture n’est pas sur la carte : son lieu n’a pas de position.";
const TOUCH_HINT = "Deux doigts pour déplacer ou zoomer la carte.";
/** A car 100 m north of the flag frames the view at zoom 15, `framing`'s most. */
const FRAMED_ZOOM = 15;

/** Marc's car, 100 m north of the flag: one point, and a view at zoom 15. */
const seedMarc = (db: Kysely<Database>, placed: SeededEvent & { place: Position }) =>
  seedCar(db, placed.id, "Marc", { position: around(placed.place, { north: 100 }) });

const panel = (page: Page) => page.getByRole("tabpanel");
const mapButton = (page: Page) => panel(page).getByRole("button", { name: "Carte", exact: true });
const container = (page: Page) => page.locator('[id="event-map-aller"]');
const notice = (page: Page, title: string) => container(page).locator("div", { has: page.getByText(title, { exact: true }) }).last();
const retry = (page: Page) => container(page).getByRole("button", { name: "Réessayer", exact: true });
/** The box of the map while it loads: the one element of the container with `aria-busy`. */
const busyBox = (page: Page) => container(page).locator('[aria-busy="true"]');

/** The page hydrated and quiet: what it loads on its own is loaded, so that a route set now catches Leaflet's code alone. */
async function quiet(page: Page, id: string) {
  await page.goto(`/e/${id}`);
  await expect(panel(page)).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".leaflet-container")).toHaveCount(0);
}

/** The text of every live region of the page, in the DOM's order. */
function liveRegions(page: Page): Promise<(string | null)[]> {
  return page
    .locator('[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]')
    .evaluateAll((regions) => regions.map((region) => region.textContent));
}

/** A request for the build's files: sent on, or answered 404, as an old build's chunk is after a deploy. */
const answers = { pass: (route: Route) => route.continue(), refuse: (route: Route) => route.fulfill({ status: 404 }) };

/**
 * The build's files, from now on: held until `release` or `refuse`, which also answers those
 * that follow (Turbopack asks once more for a chunk that failed), until `hold` again.
 */
async function holdBuild(page: Page) {
  const held: Route[] = [];
  let answer: ((route: Route) => Promise<void>) | null = null;
  await page.route("**/_next/static/**", (route) => (answer ? answer(route) : void held.push(route)));
  const settle = async (next: (route: Route) => Promise<void>) => {
    await expect.poll(() => held.length).toBeGreaterThan(0);
    answer = next;
    await Promise.all(held.splice(0).map(next));
  };
  return {
    hold: () => (answer = null),
    refuseAll: () => (answer = answers.refuse),
    release: () => settle(answers.pass),
    refuse: () => settle(answers.refuse),
  };
}

test.describe("Leaflet's code", () => {
  test("CA1.14: held, « Chargement de la carte… » in the box, aria-busy, 4.5:1, and no status region more", async ({ page, placed }) => {
    await quiet(page, placed.id);
    const before = await page.locator('[role="status"]').count();
    const build = await holdBuild(page);

    await mapButton(page).click();
    const text = busyBox(page).getByText(LOADING, { exact: true });
    await expect(text).toBeVisible();
    await expect(busyBox(page)).toHaveCount(1);
    expect(await contrast(text, text)).toBeGreaterThanOrEqual(4.5);
    expect(await page.locator('[role="status"]').count()).toBe(before);

    await build.release();
    await expect(page.getByRole("region", { name: ALLER_MAP }).locator(".leaflet-tile-loaded").first()).toBeVisible();
    await expect(container(page).locator("[aria-busy]")).toHaveCount(0);
    await expect(container(page).getByText(LOADING)).toHaveCount(0);
  });

  test("CA2.8: refused, the notice in place of the map; « Réessayer » refused again, then loaded, the focus at each step", async ({ page, placed }) => {
    await quiet(page, placed.id);
    const build = await holdBuild(page);
    build.refuseAll();

    await mapButton(page).click();
    await expect(notice(page, FAILED)).toBeVisible();
    await expect(notice(page, FAILED).getByText(BODY, { exact: true })).toBeVisible();
    // No empty box: neither the map nor its loading.
    await expect(page.getByRole("region", { name: ALLER_MAP })).toHaveCount(0);
    await expect(container(page).getByText(LOADING)).toBeHidden();
    await expect(mapButton(page)).toBeFocused();

    // « Réessayer »: the box, loading, has the focus; refused again, the notice and its « Réessayer ».
    build.hold();
    await retry(page).click();
    await expect(busyBox(page).getByText(LOADING, { exact: true })).toBeVisible();
    await expect(busyBox(page)).toBeFocused();
    await expect(container(page).getByText(FAILED)).toHaveCount(0);
    await build.refuse();
    await expect(notice(page, FAILED)).toBeVisible();
    await expect(retry(page)).toBeFocused();

    // Again, and loaded: the map, and the focus on « Carte ».
    build.hold();
    await retry(page).click();
    await expect(busyBox(page)).toBeFocused();
    await build.release();
    const map = page.getByRole("region", { name: ALLER_MAP });
    await expect(map.locator(".leaflet-tile-loaded").first()).toBeVisible();
    await expect(mapButton(page)).toBeFocused();
    await expect(container(page).getByText(FAILED)).toHaveCount(0);
  });
});

/**
 * Opens the aller's map, `answer` set for the flag's tile of the view, zoom 15: the map, the
 * status our route gave that tile, and the live regions' text before the opening.
 */
async function openWithFlagTile(page: Page, place: Position, id: string, answer: IgnAnswer) {
  const tile = tileAt(place, FRAMED_ZOOM);
  await answerTiles([tile], answer);
  await page.goto(`/e/${id}`);
  await expect(panel(page)).toBeVisible();
  const live = await liveRegions(page);
  const response = page.waitForResponse((each) => new URL(each.url()).pathname === `/tuiles/${tile}`);
  await expect(async () => {
    if ((await mapButton(page).getAttribute("aria-expanded")) !== "true") await mapButton(page).click();
    await expect(mapButton(page)).toHaveAttribute("aria-expanded", "true", { timeout: 500 });
  }).toPass();
  const status = (await response).status();
  // Through our route to the fake IGN.
  await expect.poll(async () => (await requestsForTile(tile)).length).toBeGreaterThan(0);
  return { map: page.getByRole("region", { name: ALLER_MAP }), status, live, tile };
}

/** The live regions in which `locator` is, itself included. */
const liveAround = (locator: Locator) =>
  locator.locator("xpath=ancestor-or-self::*[(@aria-live and @aria-live != 'off') or @role = 'status' or @role = 'alert' or @role = 'log']");

test.describe("the tiles", () => {
  test("CA2.4: a tile in error, the notice under the map, the points stay, nothing announced; « Réessayer », gone, the focus to the container", async ({ db, page, placed }) => {
    await seedMarc(db, placed);
    const { map, status, live, tile } = await openWithFlagTile(page, placed.place, placed.id, { kind: "error" });
    expect(status).toBe(502);
    await expect(notice(page, TILES_FAILED)).toBeVisible();
    await expect(notice(page, TILES_FAILED).getByText(BODY, { exact: true })).toBeVisible();
    await expect(points(map)).toHaveCount(1);
    await expect(map.getByRole("img", { name: /^Lieu de l’événement/ })).toBeVisible();
    // Not announced: no live region changed, and the notice is in none; it describes the map.
    expect(await liveRegions(page)).toEqual(live);
    await expect(liveAround(notice(page, TILES_FAILED))).toHaveCount(0);
    await expect(map).toHaveAccessibleDescription(`${TILES_FAILED} ${BODY}`);

    // The tile answers again: « Réessayer » asks for the tiles, the view ends without an error.
    await answerTiles([tile], { kind: "tile" });
    await retry(page).focus();
    await page.keyboard.press("Enter");
    await expect(container(page).getByText(TILES_FAILED)).toHaveCount(0);
    await expect(map).toBeFocused();
    await expect(map).toHaveAccessibleDescription("");
    await expect(points(map)).toHaveCount(1);
  });

  for (const kind of ["notFound", "notFoundBare"] as const) {
    test(`CA2.6: the fake IGN in ${kind}, a blank tile, no notice, the points stay`, async ({ db, page, placed }) => {
      await seedMarc(db, placed);
      const { map, status, tile } = await openWithFlagTile(page, placed.place, placed.id, { kind });
      expect(status).toBe(200);
      // The view ended: the blank tile loaded, like every other, none in error.
      await expect(map.locator(`img.leaflet-tile-loaded[src="/tuiles/${tile}"]`)).toHaveCount(1);
      await expect(map.locator("img.leaflet-tile:not(.leaflet-tile-loaded)")).toHaveCount(0);
      await expect(container(page).getByText(TILES_FAILED)).toHaveCount(0);
      await expect(points(map)).toHaveCount(1);
    });
  }

  for (const kind of ["invalidParameter", "forbidden", "tooMany"] as const) {
    test(`CA2.6: the fake IGN in ${kind}, a 502, the notice`, async ({ db, page, placed }) => {
      await seedMarc(db, placed);
      const { map, status } = await openWithFlagTile(page, placed.place, placed.id, { kind });
      expect(status).toBe(502);
      await expect(notice(page, TILES_FAILED)).toBeVisible();
      await expect(points(map)).toHaveCount(1);
    });
  }

  test("CA1.17: the tiles' notice, then notOnMap, then the two-finger sentence, in the DOM's order", async ({ db, page, placed }) => {
    await seedMarc(db, placed);
    await seedCar(db, placed.id, "Léa", { position: null });
    await openWithFlagTile(page, placed.place, placed.id, { kind: "error" });
    await expect(notice(page, TILES_FAILED)).toBeVisible();
    const lines = await container(page).evaluate((element) =>
      Array.from(element.children).map((child) => (child.querySelector(".leaflet-container") ? "map" : child.textContent)),
    );
    expect(lines).toEqual(["map", `${TILES_FAILED}${BODY}Réessayer`, NOT_ON_MAP, TOUCH_HINT]);
  });
});
