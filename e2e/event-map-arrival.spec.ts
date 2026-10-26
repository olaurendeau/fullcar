import type { Locator, Page } from "@playwright/test";
import type { SeededEvent } from "@/db/test-events";
import type { Position } from "@/domain/place";
import { messages } from "./device";
import { around, idle, seedCar, serverPage } from "./event-map-points";
import { leaveNoToken } from "./fixtures";
import { expect, organiserPath, test as organiserTest } from "./organiser";
import { answerFor } from "./photon";
import { namedPlace, textOf } from "./place-field";
import { placeOf } from "./tiles";

/*
 * #720 (#653, event-map v32, CA1.19): the map open at each arrival, nothing kept. On /e/{id} and
 * /e/{id}/admin, both legs and the only section of an event without a retour; folded then
 * reloaded, open again, and the fold writes nothing; one fold for both legs; the event's
 * position added later, the button folded. Nothing jumps, the device without a person: the first
 * card where the server's page drew it, at touch then with a mouse. At 360 × 780. Each test runs
 * under `organiserTraffic` (O6.1, O2.10), its event the organiser's, at `placeOf` its id. The
 * fake tile provider answers its default tile.
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

const TOUCH_HINT = "Deux doigts pour déplacer ou zoomer la carte.";

const toggle = (page: Page, leg: "aller" | "retour") => page.locator(`[data-map-toggle="${leg}"]`);
const folded = (page: Page, leg: "aller" | "retour") => page.locator(`[id="event-map-${leg}"]`);

/** Once hydrated, a leg's panel is a tab panel. */
const hydrated = (page: Page) => expect(page.getByRole("tabpanel")).toBeVisible();

/**
 * Every tile asked for, loaded: the page left, or reloaded, while a tile loads cuts its answer,
 * which `organiserTraffic` reads. A map about to start has asked for its tiles once the page is idle.
 */
async function tilesDone(page: Page) {
  await idle(page);
  await expect(page.locator("img.leaflet-tile:not(.leaflet-tile-loaded)")).toHaveCount(0);
}

/** Clicks a tab until it is selected. */
async function selectTab(page: Page, name: RegExp) {
  const tab = page.getByRole("tab", { name });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 500 });
  }).toPass();
}

/** The leg's « Carte » open, and the part it folds shown; or folded, and that part hidden. */
async function expectOpen(page: Page, leg: "aller" | "retour", open: boolean) {
  await expect(toggle(page, leg)).toHaveAttribute("aria-expanded", String(open));
  if (open) await expect(folded(page, leg)).toBeVisible();
  else await expect(folded(page, leg)).toBeHidden();
}

/** Both legs as one: the aller's « Carte », then the retour's once its tab is shown, back on the aller. */
async function expectBothLegs(page: Page, open: boolean) {
  await expectOpen(page, "aller", open);
  await selectTab(page, /^Retour/);
  await expectOpen(page, "retour", open);
  await selectTab(page, /^Aller/);
}

const routes: [route: string, path: (event: SeededEvent) => string][] = [
  ["/e/{id}", (event) => `/e/${event.id}`],
  ["/e/{id}/admin", (event) => organiserPath(event)],
];

/** Every entry of `localStorage` and `sessionStorage`, its key with its value. */
const storages = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(
      Object.entries({ localStorage, sessionStorage }).map(([name, storage]) => [
        name,
        Object.fromEntries(
          Object.keys(storage)
            .sort()
            .map((key) => [key, storage.getItem(key)]),
        ),
      ]),
    ),
  );

for (const [route, path] of routes) {
  test.describe(`CA1.19: on ${route}`, () => {
    test("open at the arrival, the aller and the retour once shown", async ({ page, placed }) => {
      await page.goto(path(placed));
      await hydrated(page);
      await expectBothLegs(page, true);
      await tilesDone(page);
    });

    test("folded then reloaded: open again; the fold writes nothing, and holds for both legs", async ({ context, page, placed }) => {
      await page.goto(path(placed));
      await hydrated(page);
      await page.waitForLoadState("networkidle");
      // Each storage starts with an entry, another event's folded card (O8.5): a state written
      // into a key already there changes no key, but its value.
      await page.evaluate(() => {
        for (const storage of [localStorage, sessionStorage]) storage.setItem("fullcar:organiser-folded:Ab3dEf7h", "1");
      });
      const cookies = async () => JSON.stringify(await context.cookies());
      const before = { storages: await storages(page), cookies: await cookies() };

      await toggle(page, "aller").click();
      await expectBothLegs(page, false);
      expect(await storages(page), "folded").toEqual(before.storages);
      expect((await cookies()) === before.cookies, "the cookies, as before").toBe(true);

      await tilesDone(page);
      await page.reload();
      await hydrated(page);
      await expectBothLegs(page, true);
      await tilesDone(page);
    });
  });
}

test.describe("CA1.19: an event without a retour", () => {
  test.use({ eventFields: { retourAt: null } });

  for (const [route, path] of routes) {
    test(`on ${route}, its only section open at the arrival`, async ({ page, placed }) => {
      await page.goto(path(placed));
      const section = page.getByRole("region", { name: "Aller", exact: true });
      await expect(section.getByRole("button", { name: "Carte", exact: true })).toBeVisible();
      await expect(page.getByRole("tab")).toHaveCount(0);
      await expectOpen(page, "aller", true);
      await tilesDone(page);
    });
  }
});

test("CA1.19: the event's position added later, on /e/{id}/admin: « Carte » comes folded, on both legs", async ({ page, seededEvent }) => {
  await page.goto(organiserPath(seededEvent));
  await hydrated(page);
  const edit = page.getByRole("tabpanel").getByRole("button", { name: "Modifier l’événement", exact: true });
  await edit.click();
  const sheet = page.getByRole("dialog", { name: "Modifier l’événement" });
  await expect(sheet).toBeVisible();

  const { lat, lng } = placeOf(seededEvent.id);
  const salle = namedPlace("Salle des fêtes", lat, lng);
  const text = textOf("Salle des f");
  await answerFor(text, { features: [salle.feature] });
  await sheet.getByLabel("Lieu", { exact: true }).fill(text);
  await sheet.getByRole("option").first().click();
  await expect(sheet.getByText(`Position : ${salle.label}`, { exact: true })).toBeVisible();
  await sheet.getByRole("button", { name: "Valider", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(messages(page)).toHaveText(["Événement modifié. Personne n’est prévenu : pensez à le dire au groupe."]);

  await expectBothLegs(page, false);
});

/** The top of `card` in the page, wherever it is scrolled. */
const topOf = (card: Locator) => card.evaluate((element) => element.getBoundingClientRect().top + window.scrollY);

for (const [pointer, device] of [
  ["at touch", {}],
  ["with a mouse", { hasTouch: false, isMobile: false }],
] as const) {
  test.describe(`CA1.19: nothing jumps, ${pointer}`, () => {
    test.use(device);

    test("no person on the device: the first card where the server's page drew it, once the map has started", async ({ db, page, placed }) => {
      expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(pointer === "at touch");
      await seedCar(db, placed.id, "Marc", { position: around(placed.place, { north: 250 }) });
      const card = page.getByRole("article", { name: "Voiture de Marc" });
      const hint = page.locator('[id="event-map-aller"]').getByText(TOUCH_HINT, { exact: true });

      await serverPage(page, `/e/${placed.id}`);
      // The style sheet loaded: the map's box has its height.
      const box = page.getByRole("region", { name: /^Carte de l’aller : / }).locator("xpath=..");
      expect((await box.boundingBox())!.height).toBe(240);
      if (pointer === "at touch") await expect(hint).toBeVisible();
      else await expect(hint).toBeHidden();
      const server = await topOf(card);

      await page.reload();
      await expect(page.locator(".leaflet-container")).toHaveCount(1);
      await expect(page.getByRole("button", { name: /^Vos inscriptions/ })).toHaveCount(0);
      if (pointer === "at touch") await expect(hint).toBeVisible();
      else await expect(hint).toBeHidden();
      const started = await topOf(card);
      test.info().annotations.push({ type: "CA1.19", description: `${pointer}: première fiche à ${server} px (serveur), ${started} px (carte démarrée)` });
      expect(Math.abs(started - server)).toBeLessThanOrEqual(1);
      await tilesDone(page);
    });
  });
}
