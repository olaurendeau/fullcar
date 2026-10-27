import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import type { SeededEvent } from "@/db/test-events";
import { seedPerson, seedPlacement } from "@/db/test-participants";
import type { Position } from "@/domain/place";
import { holdToken, newToken } from "./device";
import { idle, watchMap } from "./event-map-points";
import { leaveNoToken } from "./fixtures";
import { expect, foldKey, holdActionsWith, isAction, oneCharOff, organiserPath, test as organiserTest } from "./organiser";
import { answerTiles, placeOf, tileAt } from "./tiles";

/*
 * #719 (#653, event-map v32): the map open at the arrival, started once the page is settled and
 * its box in the screen, and for good (CA1.20); at the arrival, it never takes the focus nor
 * scrolls (CA2.11). At 360 × 780, on /e/{id} and /e/{id}/admin. Each test runs under
 * `organiserTraffic` (O6.1, O2.10), its event the organiser's, at `placeOf` its id: its tiles are
 * its own. The fake tile provider answers its default tile unless a test sets the flag's.
 */

leaveNoToken();

type Placed = SeededEvent & { place: Position };

const test = organiserTest.extend<{ placed: Placed }>({
  placed: async ({ db, seededEvent }, provide) => {
    const place = placeOf(seededEvent.id);
    await db.updateTable("event").set({ location_lat: place.lat, location_lng: place.lng }).where("id", "=", seededEvent.id).execute();
    await provide({ ...seededEvent, place });
  },
});

test.use({ locale: "fr-FR" });

const LOADING = "Chargement de la carte…";
const FAILED = "La carte n’a pas pu se charger.";
const TILES_FAILED = "Le fond de carte n’a pas pu se charger.";

const region = (page: Page) => page.getByRole("region", { name: /^Carte de l’aller : / });
const box = (page: Page) => region(page).locator("xpath=..");
const area = (page: Page) => page.getByRole("button", { name: "Espace organisateur", exact: true });

/** CA1.14: the box waits, without « Chargement de la carte… », `aria-busy` or `tabindex`. */
async function expectWaiting(page: Page) {
  await expect(box(page).getByText(LOADING)).toHaveCount(0);
  await expect(box(page)).not.toHaveAttribute("aria-busy");
  await expect(box(page)).not.toHaveAttribute("tabindex");
  await expect(page.locator(".leaflet-container")).toHaveCount(0);
}

/** Nothing of the map asked for since `watch` began. */
async function expectNothingAsked(page: Page, watch: ReturnType<typeof watchMap>) {
  await idle(page);
  expect(await watch.leaflet()).toBe(0);
  expect(watch.tiles()).toBe(0);
}

/**
 * Every tile of the view loaded: the page left while a tile loads cuts its answer, which
 * `organiserTraffic` reads.
 */
const tilesLoaded = (page: Page) => expect(page.locator("img.leaflet-tile:not(.leaflet-tile-loaded)")).toHaveCount(0);

/** The box scrolled into the screen: Leaflet's code asked for, then tiles. */
async function expectStartedByScroll(page: Page, watch: ReturnType<typeof watchMap>) {
  await region(page).scrollIntoViewIfNeeded();
  await expect.poll(() => watch.leaflet()).toBeGreaterThan(0);
  await expect.poll(() => watch.tiles()).toBeGreaterThan(0);
  await expect(region(page).locator(".leaflet-tile-loaded").first()).toBeVisible();
  await tilesLoaded(page);
}

/**
 * Twelve persons on a device of its own, the first without a car on the aller: « Vos inscriptions »
 * opens, and pushes the box under the fold. Every server action held, the read of its persons
 * first, until `settle`.
 */
async function twelveOnTheDevice(db: Kysely<Database>, page: Page, event: Placed): Promise<() => void> {
  const token = newToken();
  for (let n = 1; n <= 12; n++) {
    const person = await seedPerson(db, event.id, { firstName: `Personne ${n}` }, token);
    if (n === 1) await seedPlacement(db, { personId: person.id, eventId: event.id, leg: "aller", rideId: null });
  }
  await holdToken(page, event.id, token);
  // Let go to `organiserTraffic`'s own route, which reads each answer whole before giving it.
  let settle = () => {};
  const settled = new Promise<void>((resolve) => (settle = resolve));
  await page.route("**/e/**", async (route) => {
    if (isAction(route.request())) await settled;
    await route.fallback();
  });
  return settle;
}

test("CA1.20 (1), (3): on /e/{id}, nothing while the device's read is held; read, twelve persons push the box under the fold; a scroll starts it, for good", async ({
  db,
  page,
  placed,
}) => {
  const settle = await twelveOnTheDevice(db, page, placed);
  const watch = watchMap(page);
  const read = page.waitForRequest(isAction);
  await page.goto(`/e/${placed.id}`);
  await read;

  // Held: the box in the screen, waiting.
  await expect(region(page)).toBeInViewport();
  await expectWaiting(page);
  await expectNothingAsked(page, watch);

  settle();
  await expect(page.getByRole("button", { name: /^Vos inscriptions/ })).toHaveAttribute("aria-expanded", "true");
  await expect(region(page)).not.toBeInViewport();
  await expectNothingAsked(page, watch);
  await expectWaiting(page);

  await expectStartedByScroll(page, watch);
  // (3) Back up: the map stays.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(region(page)).not.toBeInViewport();
  await idle(page);
  await expect(page.locator(".leaflet-container")).toHaveCount(1);
  await expect(region(page)).toHaveClass(/\bleaflet-container\b/);
});

// #788: a box whose top is at the screen's bottom edge is in the screen for the observer (its
// threshold 0 counts a box touching the edge). Refused there, a scroll of 1 px into the screen
// changes nothing the observer tells: the map would wait for good.
test("CA1.20: on /e/{id}, the box's top at the bottom edge of the screen, then 1 px into it: it starts", async ({ db, page, placed }) => {
  const settle = await twelveOnTheDevice(db, page, placed);
  const watch = watchMap(page);
  const read = page.waitForRequest(isAction);
  await page.goto(`/e/${placed.id}`);
  await read;
  settle();
  await expect(page.getByRole("button", { name: /^Vos inscriptions/ })).toHaveAttribute("aria-expanded", "true");
  await expect(region(page)).not.toBeInViewport();
  await expectNothingAsked(page, watch);

  const edge = await box(page).evaluate((element) => {
    window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top - window.innerHeight);
    return element.getBoundingClientRect().top - window.innerHeight;
  });
  expect(edge).toBe(0);
  // The observer has looked at the box on the edge.
  await idle(page);
  await page.evaluate(() => window.scrollBy(0, 1));
  await expect.poll(() => watch.leaflet()).toBeGreaterThan(0);
  await expect.poll(() => watch.tiles()).toBeGreaterThan(0);
  await expect(region(page).locator(".leaflet-tile-loaded").first()).toBeVisible();
  await tilesLoaded(page);
});

test.describe("CA1.20 (2): on /e/{id}/admin", () => {
  test("the organiser area unfolded: nothing while the link is checked, nor once it is valid, the box under the fold; a scroll starts it", async ({ page, placed }) => {
    const check = await holdActionsWith(page, placed.token);
    const watch = watchMap(page);
    await page.goto(organiserPath(placed));
    await expect.poll(check.held).toBeGreaterThan(0);
    // Checking, the device without a person: the box in the screen, waiting.
    await expect(region(page)).toBeInViewport();
    await expectWaiting(page);
    await expectNothingAsked(page, watch);

    await check.release();
    await expect(area(page)).toHaveAttribute("aria-expanded", "true");
    await expect(region(page)).not.toBeInViewport();
    await expectNothingAsked(page, watch);
    await expectStartedByScroll(page, watch);
  });

  // #769: the box seen in the screen while the link is checked, pushed under the fold as it ends,
  // then scrolled back at the next frame, before the observer looks again: it saw the box in the
  // screen before, and sees it there still. The test's scroll did this, at a slow frame in CI.
  test("the organiser area unfolded, the box scrolled back into the screen at the frame after the check: it starts", async ({ page, placed }) => {
    const check = await holdActionsWith(page, placed.token);
    const watch = watchMap(page);
    await page.goto(organiserPath(placed));
    await expect.poll(check.held).toBeGreaterThan(0);
    await expect(region(page)).toBeInViewport();
    await expectWaiting(page);

    // At the commit that puts the area above the box, a frame later, before the observer's step.
    await page.evaluate(() => {
      const box = document.querySelector('[id="event-map-aller"] [role="region"]')!;
      const pushed = new MutationObserver(() => {
        if (box.getBoundingClientRect().top < window.innerHeight) return;
        pushed.disconnect();
        requestAnimationFrame(() => box.scrollIntoView({ block: "center" }));
      });
      pushed.observe(document.body, { childList: true, subtree: true });
    });
    await check.release();
    await expect(area(page)).toHaveAttribute("aria-expanded", "true");
    await expect(region(page)).toBeInViewport();
    await expect.poll(() => watch.tiles()).toBeGreaterThan(0);
    await expect(region(page).locator(".leaflet-tile-loaded").first()).toBeVisible();
    await tilesLoaded(page);
  });

  for (const end of ["invalid", "failed"] as const) {
    test(`the check ${end}, the message in place of the area: nothing while checked, nor after, the box under the fold; a scroll starts it`, async ({
      db,
      page,
      placed,
    }) => {
      // The message is shorter than the area: twelve persons push the box under the fold. Server
      // actions leave one at a time, the device's read first: held, the check waits behind it.
      const settleDevice = await twelveOnTheDevice(db, page, placed);
      const token = end === "invalid" ? oneCharOff(placed.token) : placed.token;
      const check = await holdActionsWith(page, token);
      const watch = watchMap(page);
      const sent = page.waitForRequest(isAction);
      await page.goto(organiserPath({ ...placed, token }));
      await sent;
      await expect(region(page)).toBeInViewport();
      await expectWaiting(page);
      await expectNothingAsked(page, watch);

      settleDevice();
      await expect.poll(check.held).toBeGreaterThan(0);
      await expect(page.getByRole("button", { name: /^Vos inscriptions/ })).toHaveAttribute("aria-expanded", "true");
      await expect(region(page)).not.toBeInViewport();
      if (end === "failed") await check.fail();
      else await check.release();
      await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toBeVisible();
      await expect(region(page)).not.toBeInViewport();
      await expectNothingAsked(page, watch);
      await expectStartedByScroll(page, watch);
    });
  }
});

/**
 * Refuses Leaflet's code from now on, its script and its style sheet (404, as an old build's
 * chunk after a deploy): the build's other files go through.
 */
async function refuseLeaflet(page: Page) {
  await page.route("**/_next/static/**", async (route) => {
    const response = await route.fetch();
    const body = await response.body();
    return body.includes("leaflet-control-zoom") ? route.fulfill({ status: 404 }) : route.fulfill({ response });
  });
}

const arrivals: [route: string, open: (page: Page, event: Placed) => Promise<void>][] = [
  ["/e/{id}", async (page, event) => void (await page.goto(`/e/${event.id}`))],
  [
    "/e/{id}/admin",
    // The organiser area folded, as the device kept it: the box is in the screen, and starts.
    async (page, event) => {
      await page.addInitScript((key) => localStorage.setItem(key, "1"), foldKey(event.id));
      await page.goto(organiserPath(event));
      await expect(area(page)).toHaveAttribute("aria-expanded", "false");
    },
  ],
];
const outcomes: [what: string, prepare: (page: Page, event: Placed) => Promise<void>, shown: (page: Page) => Locator][] = [
  ["Leaflet loaded", async () => {}, (page) => region(page).locator(".leaflet-tile-loaded").first()],
  ["Leaflet refused", (page) => refuseLeaflet(page), (page) => page.getByRole("tabpanel").getByText(FAILED, { exact: true })],
  // The flag alone frames the view at zoom 14.
  ["a tile in error", (_, event) => answerTiles([tileAt(event.place, 14)], { kind: "error" }), (page) => page.getByRole("tabpanel").getByText(TILES_FAILED, { exact: true })],
];

for (const [route, open] of arrivals) {
  test.describe(`CA2.11: at the arrival on ${route}, the map takes no focus and does not scroll`, () => {
    for (const [what, prepare, shown] of outcomes) {
      test(`${what}: the focus on <body>, scrollY 0`, async ({ page, placed }) => {
        await prepare(page, placed);
        await open(page, placed);
        await expect(shown(page)).toBeVisible();
        if (what === "Leaflet loaded") await tilesLoaded(page);
        await idle(page);
        expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
        expect(await page.evaluate(() => window.scrollY)).toBe(0);
      });
    }
  });
}
