import type { Locator, Page, Request } from "@playwright/test";
import { seedEvent, type SeededEvent } from "@/db/test-events";
import { seedPerson, seedRide } from "@/db/test-participants";
import type { Position } from "@/domain/place";
import { generatePublicId } from "@/domain/public-id";
import { PLAN_IGN_UPDATED } from "@/domain/tile";
import { expect, test as base } from "./fixtures";
import { placeOf, requestsForTile, tileAt } from "./ign";

/*
 * #478, event-map v11: the « Carte » button of each leg and the map behind it, with the
 * event's place alone (the cars come with #480). The event is seeded with a position, the one
 * `placeOf` draws from its id, so that its tiles are its own. The fake IGN answers its default
 * tile: no test here sets one.
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

/** « octobre 2026 »: the month of `PLAN_IGN_UPDATED`, as the French page writes it. */
function updated(): string {
  const [year, month] = PLAN_IGN_UPDATED.split("-").map(Number);
  return new Intl.DateTimeFormat("fr", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

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

/** CA1.1 on a leg: « Carte » between its actions and its first card, folded, then open under the same name. */
async function expectButton(page: Page, panel: Locator, driver: string) {
  const button = mapButton(panel);
  await expect(button).toHaveAttribute("aria-expanded", "false");
  expect(await inDomOrder(panel.getByRole("button", { name: "Proposer une voiture" }), button, panel.getByRole("article", { name: `Voiture de ${driver}` }))).toBe(true);
  const container = await folded(page, button);
  await expect(container).toHaveAttribute("hidden", "");
  expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  await openMap(panel);
  await expect(button).toHaveAccessibleName("Carte");
  await expect(container).not.toHaveAttribute("hidden");
}

for (const [where, device] of [
  ["360 px", {}],
  ["1280 px", { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false }],
] as const) {
  test.describe(`the « Carte » button, at ${where}`, () => {
    test.use({ locale: "fr-FR", ...device });

    test("CA1.1: each leg has « Carte » between its actions and its first card, folded, then open", async ({ db, page, placed }) => {
      await seedRide(db, placed.id, (await seedPerson(db, placed.id, { firstName: "Marc" })).id);
      await seedRide(db, placed.id, (await seedPerson(db, placed.id, { firstName: "Zoé" })).id, { leg: "retour" });

      await page.goto(`/e/${placed.id}`);
      await hydrated(page);
      await expectButton(page, page.getByRole("tabpanel"), "Marc");
      await selectTab(page, "Retour");
      // One state for the page: the retour's map is open too.
      await expect(mapButton(page.getByRole("tabpanel"))).toHaveAttribute("aria-expanded", "true");
      await mapButton(page.getByRole("tabpanel")).click();
      await expect(mapButton(page.getByRole("tabpanel"))).toHaveAttribute("aria-expanded", "false");
      await expectButton(page, page.getByRole("tabpanel"), "Zoé");
    });
  });
}

test.describe("the map, open", () => {
  test.use({ locale: "fr-FR" });

  test("CA1.2: neither Leaflet nor a tile before the first opening; both after", async ({ page, placed }) => {
    const leaflet: Promise<boolean>[] = [];
    const tiles: Request[] = [];
    page.on("response", (response) => {
      const type = response.request().resourceType();
      // Leaflet's own class names, in its script and in its style sheet: none of ours has them.
      if (type === "script" || type === "stylesheet") leaflet.push(response.text().then((text) => text.includes("leaflet-control-zoom"), () => false));
    });
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/tuiles/")) tiles.push(request);
    });

    await page.goto(`/e/${placed.id}`);
    await hydrated(page);
    expect((await Promise.all(leaflet)).filter(Boolean).length).toBe(0);
    expect(tiles.length).toBe(0);
    await expect(page.locator(".leaflet-container")).toHaveCount(0);

    await mapButton(page.getByRole("tabpanel")).click();
    await expect(page.getByRole("region", { name: ALLER_MAP })).toBeVisible();
    await expect.poll(async () => (await Promise.all(leaflet)).filter(Boolean).length).toBeGreaterThan(0);
    await expect(page.locator(".leaflet-tile-loaded").first()).toBeVisible();
    expect(tiles.length).toBeGreaterThan(0);
    // The flag's tile went through our route to the fake IGN.
    await expect.poll(async () => (await requestsForTile(tileAt(placed.place, 14))).length).toBeGreaterThan(0);
  });

  test("CA1.4: the flag is a named image out of the Tab order; the zoom is translated, 44 px; the attribution is text", async ({ page, placed }) => {
    await page.goto(`/e/${placed.id}`);
    await openMap(page.getByRole("tabpanel"));
    const map = page.getByRole("region", { name: ALLER_MAP });
    const flag = map.getByRole("img", { name: FLAG, exact: true });
    await expect(flag).toBeVisible();
    expect(await flag.evaluate((element) => element.closest("[tabindex]")?.getAttribute("tabindex") ?? null)).toBe("0");
    await expect(map.locator("[tabindex]:not([tabindex='-1'])")).toHaveCount(0);

    await map.focus();
    await page.keyboard.press("Tab");
    await expect(map.getByRole("button", { name: "Zoom avant", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(map.getByRole("button", { name: "Zoom arrière", exact: true })).toBeFocused();
    for (const name of ["Zoom avant", "Zoom arrière"]) {
      const box = (await map.getByRole("button", { name, exact: true }).boundingBox())!;
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
    }

    const attribution = map.locator(".leaflet-control-attribution");
    await expect(attribution).toHaveText(`Leaflet | Source : IGN – Plan IGN v2, ${updated()}`);
    await expect(attribution.locator("a")).toHaveCount(0);
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
    await expect(page.getByRole("region", { name: ALLER_MAP }).locator(".leaflet-tile-loaded").first()).toBeVisible();

    const origin = new URL(page.url()).origin;
    expect(requests.filter((url) => url.origin !== origin).length).toBe(0);
    // The page and its server actions, its build, its tiles, its icons: nothing else.
    const ours = [new RegExp(`^/e/${placed.id}$`), /^\/_next\//, /^\/tuiles\/\d+\/\d+\/\d+$/, /^\/(favicon\.ico|icon|apple-icon|manifest\.webmanifest)/];
    expect(requests.filter((url) => !ours.some((path) => path.test(url.pathname))).length).toBe(0);
    expect(requests.filter((url) => url.pathname.startsWith("/tuiles/")).length).toBeGreaterThan(0);
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

  test("CA2.5: no « Carte » button, and no sentence but Board.needsJavaScript", async ({ page, placed }) => {
    await page.goto(`/e/${placed.id}`);
    const aller = page.getByRole("region", { name: "Aller", exact: true });
    await expect(aller.locator("noscript > p")).toHaveText(NEEDS_JAVASCRIPT);
    await expect(mapButton(page)).toHaveCount(0);
    const text = await aller.innerText();
    expect(["Carte", "Chargement de la carte…"].filter((words) => text.includes(words)).length).toBe(0);
  });
});
