import type { Locator, Page } from "@playwright/test";
import { seedEvent, type SeededEvent } from "@/db/test-events";
import { seedPerson, seedRide } from "@/db/test-participants";
import type { Position } from "@/domain/place";
import { generatePublicId } from "@/domain/public-id";
import { arriveWaiting, idle, watchMap } from "./event-map-points";
import { expect, test as base } from "./fixtures";
import { placeOf, requestsForTile, tileAt } from "./tiles";

/*
 * #478, event-map v11: the « Carte » button of each leg and the map behind it, with the
 * event's place alone (the cars come with #480). The event is seeded with a position, the one
 * `placeOf` draws from its id, so that its tiles are its own. The fake tile provider answers
 * its default tile: no test here sets one.
 */

/** An event of the test's own, at `placeOf` its id; `eventFields` as the fixture's. */
const test = base.extend<{ placed: SeededEvent & { place: Position } }>({
  placed: async ({ db, eventFields }, provide) => {
    const id = generatePublicId();
    const place = placeOf(id);
    const event = await seedEvent(db, { ...eventFields, locationPosition: place }, undefined, () => id);
    await provide({ ...event, place });
    await db.deleteFrom("event").where("id", "=", event.id).execute();
  },
});

const FLAG = "Lieu de l’événement : Gymnase des Gayeulles";
const ALLER_MAP = "Carte de l’aller : le lieu de l’événement et aucune voiture";
const RETOUR_MAP = "Carte du retour : le lieu de l’événement et aucune voiture";
const NEEDS_JAVASCRIPT = "S’inscrire, proposer une voiture ou prendre une place nécessite JavaScript : activez-le, puis rechargez la page.";

const mapButton = (scope: Page | Locator) => scope.getByRole("button", { name: "Carte", exact: true });

/** Once hydrated, a leg's panel is a tab panel: before, a click on « Carte » does nothing. */
async function hydrated(page: Page) {
  await expect(page.getByRole("tabpanel")).toBeVisible();
}

/** Opens the map of `scope`, clicked again only while it stays folded (a click before hydration). */
async function openMap(scope: Page | Locator) {
  const button = mapButton(scope);
  await expect(async () => {
    if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true", { timeout: 500 });
  }).toPass();
}

/** Clicks a tab until it is selected. */
async function selectTab(page: Page, name: string) {
  const tab = page.getByRole("tab", { name });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 500 });
  }).toPass();
}

/** Whether each of `locators` comes after the one before it in the DOM. */
async function inDomOrder(...locators: Locator[]): Promise<boolean> {
  const handles = await Promise.all(locators.map((locator) => locator.elementHandle()));
  return handles[0]!.evaluate(
    (_, elements) =>
      elements.every((element, index) => index === 0 || !!(elements[index - 1]!.compareDocumentPosition(element!) & Node.DOCUMENT_POSITION_FOLLOWING)),
    handles,
  );
}

/** The container the button folds: `hidden` while folded. */
async function folded(page: Page, button: Locator): Promise<Locator> {
  const id = await button.getAttribute("aria-controls");
  expect(id).toBeTruthy();
  return page.locator(`[id="${id}"]`);
}

/** The names of what takes the focus inside `map`, its container excluded, in the DOM's order; a link without one, its text. */
function focusableIn(map: Locator): Promise<(string | null)[]> {
  return map.evaluate((container) =>
    Array.from(container.querySelectorAll<HTMLElement | SVGElement>("*"))
      .filter((element) => element.tabIndex >= 0)
      .map((element) => element.getAttribute("aria-label") ?? (element.tagName === "A" ? element.textContent : null)),
  );
}

/** The credits' link (#558), the last of the map. */
const OSM_LINK = "© OpenStreetMap (s’ouvre dans un nouvel onglet)";

/** `map` at zoom `z`: its zoom ended (Leaflet's `zoomend`, `moveend`), then each of its tiles loaded. */
async function settled(map: Locator, z: number) {
  await expect(map.locator(`img.leaflet-tile-loaded[src*="/tuiles/${z}/"]`).first()).toBeVisible();
  await expect(map.locator(".leaflet-zoom-anim")).toHaveCount(0);
  await expect(map.locator("img.leaflet-tile:not(.leaflet-tile-loaded)")).toHaveCount(0);
}

/**
 * Le conteneur of `button`, its parent: whether it has a border on each side and rounded
 * corners, « Carte » as its first child, and the part it folds inside it.
 */
function bordered(button: Locator, id: string): Promise<boolean> {
  return button.evaluate((element, id) => {
    const container = element.parentElement!;
    const style = getComputedStyle(container);
    const sides = [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth];
    return sides.every((width) => width === "1px") && parseFloat(style.borderTopLeftRadius) > 0 && container.firstElementChild === element && !!container.querySelector(`[id="${id}"]`);
  }, id);
}

/**
 * CA1.1 on a leg: « Carte » between its actions and its first card, the header of a bordered
 * container, open; a click folds it, another opens it, under the same name.
 */
async function expectButton(page: Page, panel: Locator, driver: string) {
  const button = mapButton(panel);
  await expect(button).toHaveAttribute("aria-expanded", "true");
  expect(await inDomOrder(panel.getByRole("button", { name: "Proposer une voiture" }), button, panel.getByRole("article", { name: `Voiture de ${driver}` }))).toBe(true);
  const container = await folded(page, button);
  await expect(container).toBeVisible();
  expect(await bordered(button, (await button.getAttribute("aria-controls"))!)).toBe(true);
  expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(container).toHaveAttribute("hidden", "");
  await expect(button).toHaveAccessibleName("Carte");
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(container).not.toHaveAttribute("hidden");
  await expect(button).toHaveAccessibleName("Carte");
}

/** The server's HTML of a leg: « Carte » open, and the part it folds shown, before any script. */
const SERVER_OPEN = (leg: string) => [
  new RegExp(`<button(?=[^>]*data-map-toggle="${leg}")(?=[^>]*aria-expanded="true")[^>]*>`),
  new RegExp(`<div(?=[^>]*id="event-map-${leg}")(?![^>]*\\shidden[\\s=>])[^>]*>`),
];

for (const [where, device] of [
  ["360 px", {}],
  ["416 px", { viewport: { width: 416, height: 780 } }],
  ["1280 px", { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false }],
] as const) {
  test.describe(`the « Carte » button, at ${where}`, () => {
    test.use({ locale: "fr-FR", ...device });

    test("CA1.1: each leg has le conteneur, « Carte » as its header, between its actions and its first card, open from the server's HTML; folded, then open", async ({
      db,
      page,
      placed,
    }) => {
      await seedRide(db, placed.id, (await seedPerson(db, placed.id, { firstName: "Marc" })).id);
      await seedRide(db, placed.id, (await seedPerson(db, placed.id, { firstName: "Zoé" })).id, { leg: "retour" });

      const html = await (await page.request.get(`/e/${placed.id}`)).text();
      for (const leg of ["aller", "retour"]) for (const tag of SERVER_OPEN(leg)) expect(html).toMatch(tag);
      await page.goto(`/e/${placed.id}`);
      await hydrated(page);
      await expectButton(page, page.getByRole("tabpanel"), "Marc");
      // One state for the page: the retour's map is open too.
      await selectTab(page, "Retour");
      await expectButton(page, page.getByRole("tabpanel"), "Zoé");
    });
  });
}

test.describe("the map, open", () => {
  test.use({ locale: "fr-FR" });

  test("CA1.2: neither Leaflet nor a tile until the page is settled; settled, its box in the screen, both, without a click", async ({ page, placed }) => {
    // Requests, not responses: one sent while the page is not settled, still waiting for its answer, counts.
    const watch = watchMap(page);
    const settle = await arriveWaiting(page, placed.id);
    await expect(page.getByRole("region", { name: ALLER_MAP })).toBeInViewport();
    await idle(page);
    await expect(page.locator(".leaflet-container")).toHaveCount(0);
    expect(await watch.leaflet()).toBe(0);
    expect(watch.tiles()).toBe(0);

    settle();
    await expect(page.locator(".leaflet-tile-loaded").first()).toBeVisible();
    expect(await watch.leaflet()).toBeGreaterThan(0);
    expect(watch.tiles()).toBeGreaterThan(0);
    // The flag's tile went through our route to the fake tile provider.
    await expect.poll(async () => (await requestsForTile(tileAt(placed.place, 14))).length).toBeGreaterThan(0);
  });

  test("CA1.2: folded by the person before its box is in the screen, nothing is asked for, even after a scroll", async ({ page, placed }) => {
    const watch = watchMap(page);
    const settle = await arriveWaiting(page, placed.id);
    await mapButton(page.getByRole("tabpanel")).click();
    await expect(mapButton(page.getByRole("tabpanel"))).toHaveAttribute("aria-expanded", "false");
    settle();
    // Read: the device's actions are enabled, and the page settled.
    await expect(page.getByRole("tabpanel").getByRole("button", { name: "Proposer une voiture" })).toBeEnabled();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await idle(page);
    await expect(page.locator(".leaflet-container")).toHaveCount(0);
    expect(await watch.leaflet()).toBe(0);
    expect(watch.tiles()).toBe(0);
  });

  test("CA1.4: the flag is a named image out of the Tab order; the zoom is translated, 44 px; no attribution control of Leaflet's", async ({ page, placed }) => {
    await page.goto(`/e/${placed.id}`);
    await openMap(page.getByRole("tabpanel"));
    const map = page.getByRole("region", { name: ALLER_MAP });
    const flag = map.getByRole("img", { name: FLAG, exact: true });
    await expect(flag).toBeVisible();
    // Inside the container, the zoom and then the credits' link take the focus: neither the flag nor its icon.
    expect(await focusableIn(map)).toEqual(["Zoom avant", "Zoom arrière", OSM_LINK]);

    await map.focus();
    await page.keyboard.press("Tab");
    await expect(map.getByRole("button", { name: "Zoom avant", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(map.getByRole("button", { name: "Zoom arrière", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(map.getByRole("link", { name: OSM_LINK, exact: true })).toBeFocused();
    for (const name of ["Zoom avant", "Zoom arrière"]) {
      const box = (await map.getByRole("button", { name, exact: true }).boundingBox())!;
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
    }

    // Our credits instead (#558, CA3.7): neither Leaflet's control nor its prefix.
    await expect(map.locator(".leaflet-control-attribution")).toHaveCount(0);
    await expect(map.getByText("Leaflet", { exact: false })).toHaveCount(0);
  });

  test("CA1.13: open on the aller, the retour's map starts only once its tab is shown", async ({ page, placed }) => {
    await page.goto(`/e/${placed.id}`);
    await openMap(page.getByRole("tabpanel"));
    await expect(page.getByRole("region", { name: ALLER_MAP }).locator(".leaflet-tile-loaded").first()).toBeVisible();
    const retour = page.locator('[id="event-map-retour"]');
    await expect(retour.locator(".leaflet-container")).toHaveCount(0);
    await expect(retour.locator("img")).toHaveCount(0);

    await selectTab(page, "Retour");
    const map = page.getByRole("region", { name: RETOUR_MAP });
    await expect(map.getByRole("img", { name: FLAG, exact: true })).toBeVisible();
    await expect(map.locator(".leaflet-tile-loaded").first()).toBeVisible();
  });

  test("CA3.1, CA3.3: open, every request goes to our origin, and none computes a route", async ({ page, placed }) => {
    const requests: URL[] = [];
    page.on("request", (request) => requests.push(new URL(request.url())));

    await page.goto(`/e/${placed.id}`);
    await openMap(page.getByRole("tabpanel"));
    const map = page.getByRole("region", { name: ALLER_MAP });
    await settled(map, 14);
    // Zoomed in: the map moves, and asks for the tiles of another zoom.
    await map.getByRole("button", { name: "Zoom avant", exact: true }).click();
    await settled(map, 15);

    // Every request until the end of the test, not only those sent before the first tile.
    const origin = new URL(page.url()).origin;
    expect(requests.filter((url) => url.origin !== origin).length).toBe(0);
    // The page and its server actions, its build, its tiles, its icons: nothing else.
    const ours = [new RegExp(`^/e/${placed.id}$`), /^\/_next\//, /^\/tuiles\/\d+\/\d+\/\d+$/, /^\/(favicon\.ico|icon|apple-icon|manifest\.webmanifest)/];
    expect(requests.filter((url) => !ours.some((path) => path.test(url.pathname))).length).toBe(0);
    expect(requests.filter((url) => url.pathname.startsWith("/tuiles/15/")).length).toBeGreaterThan(0);
  });
});

test.describe("an event without a retour", () => {
  test.use({ locale: "fr-FR", eventFields: { retourAt: null } });

  test("CA1.12: its only section has the button and the map, named « Carte de l’aller : … »", async ({ page, placed }) => {
    await page.goto(`/e/${placed.id}`);
    const section = page.getByRole("region", { name: "Aller", exact: true });
    await expect(page.getByRole("tab")).toHaveCount(0);
    await openMap(section);
    const map = section.getByRole("region", { name: ALLER_MAP });
    await expect(map.getByRole("img", { name: FLAG, exact: true })).toBeVisible();
    await expect(map.locator(".leaflet-tile-loaded").first()).toBeVisible();
  });
});

test.describe("an event without a position", () => {
  test.use({ locale: "fr-FR" });

  test("CA2.1: on /e/{id}, neither the button nor a map", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await hydrated(page);
    await expect(page.getByRole("button", { name: "Proposer une voiture" })).toBeVisible();
    await expect(mapButton(page)).toHaveCount(0);
    await expect(page.locator('[id^="event-map-"]')).toHaveCount(0);
    await expect(page.locator(".leaflet-container")).toHaveCount(0);
  });
});

test.describe("the map, JavaScript disabled", () => {
  test.use({ locale: "fr-FR", javaScriptEnabled: false });

  test("CA2.5: le conteneur hidden whole, and no sentence but Board.needsJavaScript", async ({ page, placed }) => {
    await page.goto(`/e/${placed.id}`);
    const aller = page.getByRole("region", { name: "Aller", exact: true });
    await expect(aller.locator("noscript > p")).toHaveText(NEEDS_JAVASCRIPT);
    await expect(mapButton(page)).toHaveCount(0);
    // The container of the part « Carte » folds, its border with it: not shown.
    for (const leg of ["aller", "retour"]) await expect(page.locator(`[id="event-map-${leg}"]`).locator("xpath=..")).toBeHidden();
    const text = await aller.innerText();
    expect(["Carte", "Chargement de la carte…"].filter((words) => text.includes(words)).length).toBe(0);
  });
});
