import type { Locator, Page, Route } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import type { SeededEvent } from "@/db/test-events";
import type { Leg } from "@/domain/leg";
import type { Position } from "@/domain/place";
import { contrast } from "./contrast";
import { around, points, seedCar, test } from "./event-map-points";
import { expect } from "./fixtures";
import { answerTiles, requestsForTile, type IgnAnswer } from "./ign";
import { tileAt } from "./tiles";

/*
 * #483, event-map v15: the map's loading and its failures, « Le chargement », « Des tuiles en
 * échec » and « Leaflet ne se charge pas »; #553, v23: « Leaflet échoue encore », one import
 * for both legs. Leaflet's code is held or answered 404 by the test, as an old build's chunk
 * is after a deploy. The fake IGN is set for one tile only, the one
 * the test checks: the flag's, at the zoom of the view (#238, the fake IGN's capacity).
 */

test.use({ locale: "fr-FR" });

const ALLER_MAP = /^Carte de l’aller : /;
const LOADING = "Chargement de la carte…";
const FAILED = "La carte n’a pas pu se charger.";
const FAILED_AGAIN = "La carte n’a toujours pas pu se charger.";
const AGAIN_BODY = "La page a peut-être été mise à jour depuis votre arrivée : rechargez-la.";
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
const container = (page: Page, leg: Leg = "aller") => page.locator(`[id="event-map-${leg}"]`);
const notice = (page: Page, title: string, leg: Leg = "aller") =>
  container(page, leg).locator("div", { has: page.getByText(title, { exact: true }) }).last();
const retry = (page: Page) => container(page).getByRole("button", { name: "Réessayer", exact: true });
const reload = (page: Page) => container(page).getByRole("button", { name: "Recharger la page", exact: true });
const tab = (page: Page, name: "Aller" | "Retour") => page.getByRole("tab", { name });

/** Shows the leg of `name`. */
async function selectTab(page: Page, name: "Aller" | "Retour") {
  await tab(page, name).click();
  await expect(tab(page, name)).toHaveAttribute("aria-selected", "true");
}
/** The box of the map while it loads: the one element of the container with `aria-busy`. */
const busyBox = (page: Page) => container(page).locator('[aria-busy="true"]');

/** The page hydrated and quiet: what it loads on its own is loaded, so that a route set now catches Leaflet's code alone. */
async function quiet(page: Page, id: string, fragment = "") {
  await page.goto(`/e/${id}${fragment}`);
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

/** A file of no build, answered 404 at once and counted nowhere: `settled`'s request. */
const BARRIER = "/_next/static/settled";

/**
 * The build's files, from now on: held until `release` or `refuse`, which also answers those
 * that follow (Turbopack asks once more for a chunk that failed), until `hold` again.
 */
async function holdBuild(page: Page) {
  const held: Route[] = [];
  // Every request routed: Leaflet's code, since nothing else is loading.
  const asked: string[] = [];
  let answer: ((route: Route) => Promise<void>) | null = null;
  await page.route("**/_next/static/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === BARRIER) return route.fulfill({ status: 404 });
    asked.push(path);
    return answer ? answer(route) : void held.push(route);
  });
  const settle = async (next: (route: Route) => Promise<void>) => {
    await expect.poll(() => held.length).toBeGreaterThan(0);
    answer = next;
    await Promise.all(held.splice(0).map(next));
  };
  /**
   * Once what the page did so far has sent what it would: two frames for its effects, then a
   * request of ours, routed after theirs. How many times each file was asked for, until then.
   */
  const settled = async () => {
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    await page.evaluate(async (url) => void (await fetch(url)), BARRIER);
    const counts = new Map<string, number>();
    for (const path of asked) counts.set(path, (counts.get(path) ?? 0) + 1);
    return counts;
  };
  return {
    settled,
    /**
     * After the first attempt, refused: each file of the module asked for once, and once more,
     * as Turbopack asks again for a chunk that failed, at times after the notice is drawn.
     */
    refusedOnce: async () => {
      await expect.poll(async () => [...new Set((await settled()).values())]).toEqual([2]);
      return settled();
    },
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

  test("CA2.8: refused, the notice in place of the map; « Réessayer », the box focused; loaded, the focus on « Carte »", async ({ page, placed }) => {
    await quiet(page, placed.id);
    const build = await holdBuild(page);
    build.refuseAll();

    await mapButton(page).click();
    await expect(notice(page, FAILED)).toBeVisible();
    await expect(notice(page, FAILED).getByText(BODY, { exact: true })).toBeVisible();
    await expect(notice(page, FAILED).getByRole("button")).toHaveText(["Réessayer"]);
    // No empty box: neither the map nor its loading.
    await expect(page.getByRole("region", { name: ALLER_MAP })).toHaveCount(0);
    await expect(container(page).getByText(LOADING)).toBeHidden();
    await expect(mapButton(page)).toBeFocused();

    // « Réessayer »: the box, loading, in place of the notice, has the focus; loaded, the map, and the focus on « Carte ».
    build.hold();
    await retry(page).click();
    await expect(busyBox(page).getByText(LOADING, { exact: true })).toBeVisible();
    await expect(busyBox(page)).toBeFocused();
    await expect(container(page).getByText(FAILED)).toHaveCount(0);
    await build.release();
    const map = page.getByRole("region", { name: ALLER_MAP });
    await expect(map.locator(".leaflet-tile-loaded").first()).toBeVisible();
    await expect(mapButton(page)).toBeFocused();
    await expect(container(page).getByText(FAILED)).toHaveCount(0);
  });

  test("CA2.8: online, the second then the third failure, « toujours » and the focus on « Recharger la page », which reloads the same address", async ({ page, placed }) => {
    await quiet(page, placed.id, "#carte");
    const address = page.url();
    const build = await holdBuild(page);
    build.refuseAll();
    await mapButton(page).click();
    await expect(notice(page, FAILED)).toBeVisible();

    for (const failure of ["second", "third"]) {
      await retry(page).click();
      await expect(notice(page, FAILED_AGAIN), failure).toBeVisible();
      await expect(notice(page, FAILED_AGAIN).getByText(AGAIN_BODY, { exact: true })).toBeVisible();
      await expect(notice(page, FAILED_AGAIN).getByRole("button")).toHaveText(["Recharger la page", "Réessayer"]);
      await expect(container(page).getByText(FAILED, { exact: true })).toHaveCount(0);
      await expect(page.getByRole("region", { name: ALLER_MAP })).toHaveCount(0);
      await expect(reload(page), failure).toBeFocused();
    }

    // The build answers again, as it does after a deploy: the same address, its fragment kept, loaded again.
    await page.unroute("**/_next/static/**");
    const loaded = page.waitForEvent("load");
    await reload(page).click();
    await loaded;
    expect(page.url()).toBe(address);
    await expect(panel(page)).toBeVisible();
    await expect(container(page).getByText(FAILED_AGAIN)).toHaveCount(0);
  });

  test("CA2.8: offline, the second failure gives the first notice, the focus on its « Réessayer »", async ({ context, page, placed }) => {
    await quiet(page, placed.id);
    const build = await holdBuild(page);
    build.refuseAll();
    await mapButton(page).click();
    await expect(notice(page, FAILED)).toBeVisible();

    await context.setOffline(true);
    await retry(page).click();
    await expect(retry(page)).toBeFocused();
    await expect(notice(page, FAILED)).toBeVisible();
    await expect(notice(page, FAILED).getByRole("button")).toHaveText(["Réessayer"]);
    await expect(container(page).getByText(FAILED_AGAIN)).toHaveCount(0);
    await context.setOffline(false);
  });

  test("CA2.10: one import for both legs; « Réessayer » on the aller, loaded, and the retour shows its map, not the notice", async ({ page, placed }) => {
    await quiet(page, placed.id);
    const build = await holdBuild(page);

    // Both legs open, one state for the page: one attempt, refused.
    await mapButton(page).click();
    await build.refuse();
    await expect(notice(page, FAILED)).toBeVisible();
    await expect(container(page, "retour").getByText(FAILED, { exact: true })).toHaveCount(1);
    const first = await build.refusedOnce();

    // The retour shown after the failure, before any attempt: the notice, no request, the focus on its tab.
    await selectTab(page, "Retour");
    await expect(notice(page, FAILED, "retour")).toBeVisible();
    await expect(tab(page, "Retour")).toBeFocused();
    expect(await build.settled()).toEqual(first);

    // « Réessayer » on the aller: one attempt more, for both legs.
    await selectTab(page, "Aller");
    build.hold();
    await retry(page).click();
    await build.release();
    await expect(page.getByRole("region", { name: ALLER_MAP }).locator(".leaflet-tile-loaded").first()).toBeVisible();
    await expect(mapButton(page)).toBeFocused();
    // Loaded: each file once more, and no other.
    const second = await build.settled();
    expect(second).toEqual(new Map([...first].map(([path, count]) => [path, count + 1])));

    // The retour, once shown: its map, started now, and not the notice.
    await selectTab(page, "Retour");
    await expect(page.getByRole("region", { name: /^Carte du retour : / }).locator(".leaflet-tile-loaded").first()).toBeVisible();
    await expect(container(page, "retour").getByText(FAILED)).toHaveCount(0);
  });

  test("CA2.10: folded while it loads, the attempt ends all the same; opened again, its notice, no request, the focus on « Carte »", async ({ page, placed }) => {
    await quiet(page, placed.id);
    const build = await holdBuild(page);

    await mapButton(page).click();
    await expect(busyBox(page)).toHaveCount(1);
    await mapButton(page).click();
    await expect(mapButton(page)).toHaveAttribute("aria-expanded", "false");
    await build.refuse();
    // Ended folded: the notice is drawn, hidden.
    await expect(container(page).getByText(FAILED, { exact: true })).toHaveCount(1);
    await expect(container(page)).toBeHidden();
    const asked = await build.refusedOnce();

    await mapButton(page).click();
    await expect(mapButton(page)).toHaveAttribute("aria-expanded", "true");
    await expect(notice(page, FAILED)).toBeVisible();
    await expect(page.getByRole("region", { name: ALLER_MAP })).toHaveCount(0);
    await expect(mapButton(page)).toBeFocused();
    expect(await build.settled()).toEqual(asked);
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
