import type { Locator, Page } from "@playwright/test";
import { seedStop } from "@/db/test-participants";
import { around, inside, mapName, openMap, points, seedCar, test, type Box } from "./event-map-points";
import { expect, leaveNoToken } from "./fixtures";

/*
 * #893, epic #881, RV5.4, RV5.6 and RV7.1: the bubble of a Stop, and the Stops of several cars at
 * one point. A press on a Stop opens its bubble, titled « {lieu}, {heure} », a button for each
 * car; Stops of different cars less than 25 m apart are one round and a bubble « 2 voitures »;
 * the Stops follow their car in the Tab order, and a Stop with the focus is raised above the
 * labels of the cars (WCAG 2.4.11); its name starts with its visible text (WCAG 2.5.3). The
 * project `e2e` is a Pixel 7. Phone numbers are nowhere on the map: no field to hide.
 */

test.use({ locale: "fr-FR", eventFields: { stopsEnabled: true } });
leaveNoToken();

const stops = (map: Locator) => map.locator("button[data-map-stop]");
const panel = (page: Page) => page.getByRole("tabpanel");
/** The bubble of a Stop or a point: the only group of the map. */
const bubbleOf = (map: Locator, name: string | RegExp) => map.getByRole("group", { name });

/** The names of the next `count` elements the Tab key reaches from the map's container, as « voiture Marc » or « arrêt 08:25 Marc ». */
async function tabbed(page: Page, map: Locator, count: number): Promise<string[]> {
  await map.focus();
  const names: string[] = [];
  for (let n = 0; n < count; n++) {
    await page.keyboard.press("Tab");
    const name = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
    names.push(name.replace(/^(\d\d:\d\d \S+), .*$/, "arrêt $1").replace(/^Voiture de (\S+), départ.*$/, "voiture $1"));
  }
  return names;
}

test("RV5.4: a press on a Stop opens its bubble, titled « lieu, heure », with a button that leads to the card of its car", async ({ db, page, placed }) => {
  const marc = await seedCar(db, placed.id, "Marc", { position: around(placed.place, { east: 3000 }), location: "Champcella", departureTime: "08:00:00", seats: 3 });
  await seedStop(db, placed.id, marc, { location: "Prelles boucherie", time: "08:25:00", position: around(placed.place, { north: 1500 }) });

  await page.goto(`/e/${placed.id}`);
  const map = await openMap(page, mapName("aller", "1 voiture"));
  const stop = stops(map);
  await expect(stop).toHaveAttribute("aria-expanded", "false");
  // On its round: its label may lie under Marc's, 1.5 km from it.
  await stop.locator("[data-map-stop-dot]").tap();

  const bubble = bubbleOf(map, "Prelles boucherie, 08:25");
  await expect(bubble).toBeVisible();
  await expect(stop).toHaveAttribute("aria-expanded", "true");
  await expect(bubble.locator("p").first()).toHaveText("Prelles boucherie, 08:25");
  // One car: its title is the place and time, no « 1 voiture ».
  await expect(bubble.getByText(/\d voiture/)).toHaveCount(0);
  const button = bubble.getByRole("button", { name: /^Voiture de Marc, départ : Champcella, 3 places libres$/ });
  await expect(button).toBeFocused();
  expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  await button.click();
  await expect(panel(page).getByRole("heading", { name: "Voiture de Marc", exact: true })).toBeFocused();
  await expect(bubble).toHaveCount(0);
});

test("RV5.4: Escape closes the bubble of a Stop and gives the focus back to it", async ({ db, page, placed }) => {
  const marc = await seedCar(db, placed.id, "Marc", { position: around(placed.place, { east: 3000 }), departureTime: "08:00:00" });
  await seedStop(db, placed.id, marc, { location: "Prelles boucherie", time: "08:25:00", position: around(placed.place, { north: 1500 }) });

  await page.goto(`/e/${placed.id}`);
  const map = await openMap(page, mapName("aller", "1 voiture"));
  await stops(map).evaluate((button: HTMLElement) => button.focus({ preventScroll: true }));
  await page.keyboard.press("Enter");
  await expect(bubbleOf(map, "Prelles boucherie, 08:25")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(bubbleOf(map, "Prelles boucherie, 08:25")).toHaveCount(0);
  await expect(stops(map)).toBeFocused();
  await expect(stops(map)).toHaveAttribute("aria-expanded", "false");
});

test("RV5.4, CA1.23: the Stops follow their car in the Tab order, whatever the order they were drawn in", async ({ db, page, placed }) => {
  const marc = await seedCar(db, placed.id, "Marc", { position: around(placed.place, { east: 3000 }), departureTime: "08:00:00" });
  const sophie = await seedCar(db, placed.id, "Sophie", { position: around(placed.place, { north: 1500 }), location: "Gare", departureTime: "09:00:00" });
  // Written in the order of their ranks, not of their times, and Sophie's before Marc's second.
  await seedStop(db, placed.id, marc, { location: "Briançon carrefour", time: "08:35:00", position: around(placed.place, { east: 1000, north: 800 }) });
  await seedStop(db, placed.id, sophie, { location: "Monétier", time: "09:20:00", position: around(placed.place, { north: 700, east: -300 }) });
  await seedStop(db, placed.id, marc, { location: "Prelles boucherie", time: "08:25:00", position: around(placed.place, { east: 2000, north: 500 }) });

  await page.goto(`/e/${placed.id}`);
  const map = await openMap(page, mapName("aller", "2 voitures"));
  await expect(stops(map)).toHaveCount(3);

  expect(await tabbed(page, map, 5)).toEqual(["voiture Marc", "arrêt 08:25 Marc", "arrêt 08:35 Marc", "voiture Sophie", "arrêt 09:20 Sophie"]);
});

test("RV5.4, WCAG 2.4.11, #918: at 360 px, a Stop at 10 m from a car, whose label covered it, shows at rest, and goes under the label of that car while it has the focus", async ({ db, page, placed }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const marc = await seedCar(db, placed.id, "Marc", { position: around(placed.place, { east: 3000 }), departureTime: "08:00:00" });
  const spot = around(placed.place, { north: 1200 });
  await seedStop(db, placed.id, marc, { location: "Prelles boucherie", time: "08:25:00", position: spot });
  // 10 m from the Stop: less than 25 m, and still not grouped with it, a car being a car; her label lies over its round.
  await seedCar(db, placed.id, "Inès", { position: around(spot, { north: 10 }), location: "Gare", departureTime: "09:00:00" });

  await page.goto(`/e/${placed.id}`);
  const map = await openMap(page, mapName("aller", "2 voitures"));
  await expect(stops(map)).toHaveCount(1);
  await expect(points(map)).toHaveCount(2);
  const stop = stops(map);
  const dot = stop.locator("[data-map-stop-dot]");
  /** Whether the centre of the round shows the Stop: the label of a car would be what the point lands on otherwise. */
  const shows = () =>
    dot.evaluate((element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return !!element.closest("[data-map-stop]")?.contains(document.elementFromPoint(x + width / 2, y + height / 2));
    });
  await dot.scrollIntoViewIfNeeded();
  // At the first framing: the Stop is the element at its centre, above Inès's label at rest (z-1).
  expect(await shows(), "the round shows at rest").toBe(true);

  // The focus in Inès's point raises her label above the Stop (z-999), which goes under it.
  const ines = points(map).filter({ hasText: "Inès" });
  await ines.evaluate((button: HTMLElement) => button.focus({ preventScroll: true }));
  await expect(ines).toBeFocused();
  expect(await shows(), "the round goes under a focused label").toBe(false);

  // Out of her point, the Stop shows again.
  await page.keyboard.press("Tab");
  await expect(ines).not.toBeFocused();
  expect(await shows()).toBe(true);
});

test.describe("with a mouse", () => {
  // The hover in a context with a mouse, the project being a touch Pixel 7 (CA1.23, amendment 4).
  test.use({ hasTouch: false, isMobile: false });

  test("RV5.4, CA1.23, #918: a Stop shows over a car's label at rest, and goes under it while a mouse is over a part of that label that shows", async ({
    db,
    page,
    placed,
  }) => {
    const marc = await seedCar(db, placed.id, "Marc", { position: around(placed.place, { east: 3000 }), departureTime: "08:00:00" });
    const spot = around(placed.place, { north: 1200 });
    await seedStop(db, placed.id, marc, { location: "Prelles boucherie", time: "08:25:00", position: spot });
    // 10 m from the Stop, and not grouped with it, a car being a car: her label lies near its round.
    await seedCar(db, placed.id, "Inès", { position: around(spot, { north: 10 }), location: "Gare", departureTime: "09:00:00" });

    await page.goto(`/e/${placed.id}`);
    const map = await openMap(page, mapName("aller", "2 voitures"));
    await expect(stops(map)).toHaveCount(1);
    await expect(points(map)).toHaveCount(2);
    const stop = stops(map);
    const dot = stop.locator("[data-map-stop-dot]");
    const ines = points(map).filter({ hasText: "Inès" });
    /** Whether the centre of the round shows the Stop: the label of a car would be what the point lands on otherwise. */
    const shows = () =>
      dot.evaluate((element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return !!element.closest("[data-map-stop]")?.contains(document.elementFromPoint(x + width / 2, y + height / 2));
      });
    /** A spot of Inès's label where it is on top of the Stop, relative to her button, for Playwright's `position`. */
    const visibleSpot = () =>
      ines.evaluate((button) => {
        const stopButton = document.querySelector("button[data-map-stop]")!;
        const label = button.getBoundingClientRect();
        const y = label.y + label.height / 2;
        for (let x = label.x + 2; x < label.x + label.width - 2; x += 2) {
          const element = document.elementFromPoint(x, y);
          if (button.contains(element) && !stopButton.contains(element)) return { x: x - label.x, y: y - label.y };
        }
        return null;
      });
    await dot.scrollIntoViewIfNeeded();
    const away = (await map.boundingBox())!;
    await page.mouse.move(away.x + 10, Math.max(1, away.y - 30));
    expect(await shows(), "the round shows at rest").toBe(true);

    // The mouse over a part of her label that shows: the label is raised, the round goes under it if they meet.
    const position = await visibleSpot();
    expect(position, "a part of her label shows").not.toBeNull();
    await ines.hover({ position: position! });
    expect(await shows(), "the round goes under a hovered label").toBe(false);

    // The mouse out of the map: the round shows again.
    await page.mouse.move(away.x + 10, Math.max(1, away.y - 30));
    expect(await shows()).toBe(true);
  });
});

test("WCAG 2.5.3: the accessible name of a Stop's button starts with its visible text, then its name", async ({ db, page, placed }) => {
  const marc = await seedCar(db, placed.id, "Marc", { position: around(placed.place, { east: 3000 }), departureTime: "08:00:00" });
  const nina = await seedCar(db, placed.id, "Nina", { position: around(placed.place, { north: 1500 }), departureTime: "09:00:00" });
  await seedStop(db, placed.id, marc, { location: "Prelles boucherie", time: "08:25:00", position: around(placed.place, { east: 2000, north: 500 }) });
  await seedStop(db, placed.id, nina, { location: "Monétier", time: "09:20:00", position: around(placed.place, { north: 700 }) });
  const paul = await seedCar(db, placed.id, "Paul", { position: around(placed.place, { east: -2000 }), departureTime: "10:00:00" });
  await seedStop(db, placed.id, paul, { location: "Gare", time: "10:15:00", position: around(placed.place, { east: -1000, north: -500 }) });
  await seedStop(db, placed.id, marc, { location: "Gare nord", time: "08:30:00", position: around(placed.place, { east: -1000, north: -490 }) });

  await page.goto(`/e/${placed.id}`);
  const map = await openMap(page, mapName("aller", "3 voitures"));
  await expect(stops(map)).toHaveCount(3);

  const names: [string, string][] = [];
  for (const stop of await stops(map).all()) {
    const [name, visible] = await Promise.all([stop.getAttribute("aria-label"), stop.locator("[data-map-stop-label]").textContent()]);
    names.push([name!, visible!]);
  }
  expect(names).toHaveLength(3);
  for (const [name, visible] of names) expect(name.startsWith(`${visible}, `), `« ${name} » starts with « ${visible} »`).toBe(true);
  expect(names.map(([name]) => name).sort()).toEqual([
    "08:25 Marc, Point de RDV de Marc : Prelles boucherie, 08:25",
    "08:30 · 2 voitures, Point de RDV de Marc, Paul : Gare nord, 08:30",
    "09:20 Nina, Point de RDV de Nina : Monétier, 09:20",
  ]);
  // The role-and-name query reads the same name.
  await expect(map.getByRole("button", { name: "08:25 Marc, Point de RDV de Marc : Prelles boucherie, 08:25", exact: true })).toBeVisible();
});

test("RV5.6: the Stops of two cars 10 m apart are one round: the title « 2 voitures », the place and time under it, a button for each car", async ({ db, page, placed }) => {
  const marc = await seedCar(db, placed.id, "Marc", { position: around(placed.place, { east: 3000 }), location: "Champcella", departureTime: "08:00:00", seats: 3 });
  const nina = await seedCar(db, placed.id, "Nina", { position: around(placed.place, { east: 2800, north: 600 }), location: "Gare", departureTime: "09:00:00", seats: 1 });
  const spot = around(placed.place, { north: 1500 });
  await seedStop(db, placed.id, marc, { location: "Prelles boucherie", time: "08:25:00", position: spot });
  await seedStop(db, placed.id, nina, { location: "Prelles église", time: "09:20:00", position: around(spot, { north: 10 }) });

  await page.goto(`/e/${placed.id}`);
  const map = await openMap(page, mapName("aller", "2 voitures"));

  // One round, at the first one's place; the two cars keep their own points.
  await expect(stops(map)).toHaveCount(1);
  await expect(points(map)).toHaveCount(2);
  const stop = stops(map);
  await expect(stop.locator("[data-map-stop-label]")).toHaveText("08:25 · 2 voitures");
  await expect(stop).toHaveAccessibleName("08:25 · 2 voitures, Point de RDV de Marc, Nina : Prelles boucherie, 08:25");

  await stop.locator("[data-map-stop-dot]").tap();
  const bubble = bubbleOf(map, "2 voitures Prelles boucherie, 08:25");
  await expect(bubble).toBeVisible();
  await expect(bubble.locator("p").nth(0)).toHaveText("2 voitures");
  await expect(bubble.locator("p").nth(1)).toHaveText("Prelles boucherie, 08:25");
  const buttons = bubble.getByRole("button");
  await expect(buttons).toHaveCount(3);
  // #918: Marc's line is the title's own place and time, so it says nothing more; Nina's, at another place and time, says hers.
  await expect(buttons.nth(0)).toHaveText(/^Voiture de Marc\s*\d*$/);
  await expect(buttons.nth(0)).toHaveAccessibleName(/^Voiture de Marc, départ : Champcella, 3 places libres$/);
  await expect(buttons.nth(1)).toContainText("Voiture de Nina · Prelles église, 09:20");
  await expect(buttons.nth(1)).toHaveAccessibleName(/^Voiture de Nina · Prelles église, 09:20, Voiture de Nina, départ : Gare, 1 place libre$/);
  await expect(buttons.nth(2)).toHaveAccessibleName("Fermer");
  for (const button of await buttons.all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  await buttons.nth(1).click();
  await expect(panel(page).getByRole("heading", { name: "Voiture de Nina", exact: true })).toBeFocused();
  await expect(bubble).toHaveCount(0);
});

test("RV5.6: two Stops of one car 10 m apart stay two rounds, and a Stop 10 m from another car's Stop makes a round with it alone", async ({ db, page, placed }) => {
  const marc = await seedCar(db, placed.id, "Marc", { position: around(placed.place, { east: 3000 }), departureTime: "08:00:00" });
  const nina = await seedCar(db, placed.id, "Nina", { position: around(placed.place, { east: 2800, north: 600 }), departureTime: "09:00:00" });
  const spot = around(placed.place, { north: 1500 });
  await seedStop(db, placed.id, marc, { location: "Prelles boucherie", time: "08:25:00", position: spot });
  await seedStop(db, placed.id, marc, { location: "Prelles église", time: "08:30:00", position: around(spot, { north: 10 }) });
  await seedStop(db, placed.id, nina, { location: "Prelles mairie", time: "09:20:00", position: around(spot, { east: 5 }) });

  await page.goto(`/e/${placed.id}`);
  const map = await openMap(page, mapName("aller", "2 voitures"));

  // Marc's first Stop and Nina's make one round; Marc's second, his own.
  await expect(stops(map)).toHaveCount(2);
  await expect(stops(map).first().locator("[data-map-stop-label]")).toHaveText("08:25 · 2 voitures");
  await expect(stops(map).last().locator("[data-map-stop-label]")).toHaveText("08:30 Marc");
});

test("RV7.1: at 360 px, a place of 120 characters in the bubble of a Stop, one car and two: no overflow, targets of 44 px at least", async ({ db, page, placed }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const place = "Parking de la grande surface commerciale du quartier des Hauts de la Vallée, à droite du rond-point après le péage nord.";
  expect(place.length).toBe(120);
  const marc = await seedCar(db, placed.id, "Marc", { position: around(placed.place, { east: 3000 }), departureTime: "08:00:00" });
  const nina = await seedCar(db, placed.id, "Nina", { position: around(placed.place, { east: 2800, north: 600 }), departureTime: "09:00:00" });
  const spot = around(placed.place, { north: 1500 });
  await seedStop(db, placed.id, marc, { location: place, time: "08:25:00", position: spot });
  await seedStop(db, placed.id, nina, { location: place, time: "09:20:00", position: around(spot, { north: 10 }) });
  const paul = await seedCar(db, placed.id, "Paul", { position: around(placed.place, { east: -3000 }), departureTime: "10:00:00" });
  await seedStop(db, placed.id, paul, { location: place, time: "10:15:00", position: around(placed.place, { east: -1500, north: -500 }) });

  await page.goto(`/e/${placed.id}`);
  const map = await openMap(page, mapName("aller", "3 voitures"));
  await expect(stops(map)).toHaveCount(2);

  for (const [label, title] of [
    ["10:15 Paul", `${place}, 10:15`],
    ["08:25 · 2 voitures", "2 voitures"],
  ]) {
    const stop = stops(map).filter({ hasText: label });
    // From the keyboard: at 360 px a label of a car may lie over the round, which a touch would not reach.
    await stop.evaluate((button: HTMLElement) => button.focus({ preventScroll: true }));
    await page.keyboard.press("Enter");
    const bubble = bubbleOf(map, new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    await expect(bubble).toBeVisible();
    const [box, mapBox] = [(await bubble.boundingBox())! as Box, (await map.boundingBox())! as Box];
    expect(inside(box, mapBox), `the bubble ${JSON.stringify(box)} in the map ${JSON.stringify(mapBox)}`).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    // Nothing of the bubble is wider than the bubble itself.
    expect(await bubble.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    for (const button of await bubble.getByRole("button").all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press("Escape");
    await expect(bubble).toHaveCount(0);
  }
});
