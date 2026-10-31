import type { Locator, Page } from "@playwright/test";
import { seedPerson, seedPlacement, seedStop } from "@/db/test-participants";
import { holdToken, newToken } from "./device";
import { anchor, around, FLAG, lines, mapName, openMap, points, seedCar, test } from "./event-map-points";
import { expect, leaveNoToken } from "./fixtures";

/*
 * #887, epic #881, RV5.1 to RV5.3 and RV5.5: the Stops of the cars on the aller's map, a white
 * round with a label « heure + prénom » each, and the line of a car through them. A Stop is
 * read only when the event's option is on (RV8.3): the tests turn it on, but the last. The
 * bubble of a Stop and its grouping are #893's. The project `e2e` is a Pixel 7.
 */

test.use({ locale: "fr-FR", eventFields: { stopsEnabled: true } });
// One test holds a personal token on the device (RV5.5).
leaveNoToken();

/** The Stops of `map`, in the DOM's order. */
const stops = (map: Locator) => map.locator("button[data-map-stop]");
const stopName = (driver: string, place: string, time: string) => `Point de RDV de ${driver} : ${place}, ${time}`;
const ONE_NOT_ON_MAP = "1 point de RDV n’est pas sur la carte : son lieu n’a pas de position.";
const TWO_NOT_ON_MAP = "2 points de RDV ne sont pas sur la carte : leurs lieux n’ont pas de position.";

/** The vertices of each line of `map`, where the page draws them, in the order of the line. */
async function vertices(map: Locator): Promise<{ x: number; y: number }[][]> {
  return lines(map).evaluateAll((paths) =>
    paths.map((path) => {
      const matrix = (path as SVGPathElement).getScreenCTM()!;
      const numbers = (path.getAttribute("d") ?? "").match(/-?\d+(\.\d+)?/g)!.map(Number);
      const pairs: { x: number; y: number }[] = [];
      for (let n = 0; n + 1 < numbers.length; n += 2) {
        const [x, y] = [numbers[n], numbers[n + 1]];
        pairs.push({ x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f });
      }
      return pairs;
    }),
  );
}

const near = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) <= 2 && Math.abs(a.y - b.y) <= 2;

/** Where `marker` is anchored in `map`, whatever the page's scroll: a new state may scroll it. */
async function anchorIn(map: Locator, marker: Locator) {
  const [{ x, y }, box] = [await anchor(marker), (await map.boundingBox())!];
  return { x: x - box.x, y: y - box.y };
}

/** Clicks a tab until it is selected. */
async function selectTab(page: Page, name: string) {
  const tab = page.getByRole("tab", { name });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 500 });
  }).toPass();
}

test("RV5.1: a round and a label « heure + prénom » for each Stop with a position, named by its driver, place and time; none on the retour", async ({ db, page, placed }) => {
  const marc = await seedCar(db, placed.id, "Marc", { position: around(placed.place, { east: 3000 }), location: "Champcella", departureTime: "08:00:00" });
  await seedStop(db, placed.id, marc, { location: "Prelles boucherie", time: "08:25:00", position: around(placed.place, { east: 2000, north: 500 }) });
  await seedStop(db, placed.id, marc, { location: "Briançon carrefour", time: "08:35:00", position: around(placed.place, { east: 1000, north: 800 }) });
  await seedStop(db, placed.id, marc, { location: "Monétier", time: "08:50:00" });
  await seedCar(db, placed.id, "Inès", { position: around(placed.place, { north: -500, east: -500 }), location: "Gare", leg: "retour" });

  await page.goto(`/e/${placed.id}`);
  const map = await openMap(page, mapName("aller", "1 voiture"));

  await expect(stops(map)).toHaveCount(2);
  const first = map.getByRole("button", { name: stopName("Marc", "Prelles boucherie", "08:25"), exact: true });
  const second = map.getByRole("button", { name: stopName("Marc", "Briançon carrefour", "08:35"), exact: true });
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  await expect(first.locator("[data-map-stop-label]")).toHaveText("08:25 Marc");
  await expect(second.locator("[data-map-stop-label]")).toHaveText("08:35 Marc");
  // White, with a #171717 border: the round.
  await expect(first.locator("[data-map-stop-dot]")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(first.locator("[data-map-stop-dot]")).toHaveCSS("border-top-color", "rgb(23, 23, 23)");
  // 44 px at least.
  const box = (await first.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(44);
  // Not a car's point.
  await expect(points(map)).toHaveCount(1);

  await selectTab(page, "Retour");
  const retour = page.getByRole("region", { name: mapName("retour", "1 voiture"), exact: true });
  await expect(retour.locator(".leaflet-tile-loaded").first()).toBeVisible();
  await expect(stops(retour)).toHaveCount(0);
  await expect(page.getByRole("tabpanel").getByText(/de RDV/)).toHaveCount(0);
});

test("RV5.1: a Stop leads to the card of its car, as a point does, until its bubble comes (#893)", async ({ db, page, placed }) => {
  const marc = await seedCar(db, placed.id, "Marc", { position: around(placed.place, { east: 3000 }), departureTime: "08:00:00" });
  await seedStop(db, placed.id, marc, { location: "Prelles boucherie", time: "08:25:00", position: around(placed.place, { north: 1500 }) });

  await page.goto(`/e/${placed.id}`);
  const map = await openMap(page, mapName("aller", "1 voiture"));
  // On its round: its label may lie under Marc's, 1 km from it.
  await map.getByRole("button", { name: stopName("Marc", "Prelles boucherie", "08:25"), exact: true }).locator("[data-map-stop-dot]").tap();

  await expect(page.getByRole("tabpanel").getByRole("heading", { name: "Voiture de Marc", exact: true })).toBeFocused();
});

test("RV5.2: the line of a car goes from the car through its Stops, in the order of their times, to the flag, and replaces the straight one", async ({ db, page, placed }) => {
  const marc = await seedCar(db, placed.id, "Marc", { position: around(placed.place, { east: 3000 }), departureTime: "08:00:00" });
  // Written in the order of their ranks, not of their times.
  await seedStop(db, placed.id, marc, { location: "Briançon carrefour", time: "08:35:00", position: around(placed.place, { east: 1000, north: 800 }) });
  await seedStop(db, placed.id, marc, { location: "Prelles boucherie", time: "08:25:00", position: around(placed.place, { east: 2000, north: 500 }) });
  await seedStop(db, placed.id, marc, { location: "Monétier", time: "08:30:00" });

  await page.goto(`/e/${placed.id}`);
  const map = await openMap(page, mapName("aller", "1 voiture"));

  await expect(stops(map)).toHaveCount(2);
  await expect(lines(map)).toHaveCount(1);
  const expected = [
    await anchor(points(map).first()),
    await anchor(map.getByRole("button", { name: stopName("Marc", "Prelles boucherie", "08:25"), exact: true })),
    await anchor(map.getByRole("button", { name: stopName("Marc", "Briançon carrefour", "08:35"), exact: true })),
    await anchor(map.getByRole("img", { name: FLAG, exact: true })),
  ];
  const [line] = await vertices(map);
  expect(line).toHaveLength(4);
  line.forEach((vertex, n) => expect(near(vertex, expected[n]), `vertex ${n}: ${JSON.stringify(vertex)} for ${JSON.stringify(expected[n])}`).toBe(true));
});

test("RV5.2: in a group of cars 25 m apart, the car with Stops draws its own line, and the group's straight line stays for the car without", async ({ db, page, placed }) => {
  const parking = around(placed.place, { east: 3000 });
  const nina = await seedCar(db, placed.id, "Nina", { position: parking, departureTime: "08:00:00" });
  await seedCar(db, placed.id, "Paul", { position: around(parking, { north: 10 }), departureTime: "09:00:00" });
  await seedStop(db, placed.id, nina, { location: "Prelles boucherie", time: "08:25:00", position: around(placed.place, { east: 1500, north: 600 }) });

  await page.goto(`/e/${placed.id}`);
  const map = await openMap(page, mapName("aller", "2 voitures"));

  await expect(stops(map)).toHaveCount(1);
  await expect(points(map)).toHaveCount(1);
  // The group's, to the flag, and Nina's, through her Stop.
  const drawn = await vertices(map);
  expect(drawn.map((line) => line.length).sort()).toEqual([2, 3]);
});

test("RV5.1, RV5.3: two Stops 10 m apart stay two; one without a position is counted in the sentence, singular and plural", async ({ db, page, placed }) => {
  const marc = await seedCar(db, placed.id, "Marc", { position: around(placed.place, { east: 3000 }), departureTime: "08:00:00" });
  const spot = around(placed.place, { east: 1500, north: 400 });
  await seedStop(db, placed.id, marc, { location: "Prelles boucherie", time: "08:25:00", position: spot });
  await seedStop(db, placed.id, marc, { location: "Prelles église", time: "08:26:00", position: around(spot, { north: 10 }) });
  await seedStop(db, placed.id, marc, { location: "Monétier", time: "08:50:00" });

  await page.goto(`/e/${placed.id}`);
  const map = await openMap(page, mapName("aller", "1 voiture"));

  await expect(stops(map)).toHaveCount(2);
  await expect(page.getByText(ONE_NOT_ON_MAP, { exact: true })).toBeVisible();

  // The plural, with a Stop of a car without a position too: all of its Stops are counted.
  const nina = await seedCar(db, placed.id, "Nina", { position: null, location: "Gare", departureTime: "09:00:00" });
  await seedStop(db, placed.id, nina, { location: "Briançon carrefour", time: "09:30:00", position: around(placed.place, { east: 500 }) });
  await page.reload();
  const again = await openMap(page, mapName("aller", "1 voiture"));
  await expect(page.getByText(TWO_NOT_ON_MAP, { exact: true })).toBeVisible();
  await expect(page.getByText(ONE_NOT_ON_MAP, { exact: true })).toHaveCount(0);
  await expect(stops(again)).toHaveCount(2);
});

test("RV5.3: no Stop with a position: the map as before, a car and its straight line, and the sentence", async ({ db, page, placed }) => {
  const marc = await seedCar(db, placed.id, "Marc", { position: around(placed.place, { east: 3000 }), departureTime: "08:00:00" });
  await seedStop(db, placed.id, marc, { location: "Prelles boucherie", time: "08:25:00" });
  await seedStop(db, placed.id, marc, { location: "Briançon carrefour", time: "08:35:00" });

  await page.goto(`/e/${placed.id}`);
  const map = await openMap(page, mapName("aller", "1 voiture"));

  await expect(stops(map)).toHaveCount(0);
  await expect(points(map)).toHaveCount(1);
  const drawn = await vertices(map);
  expect(drawn).toHaveLength(1);
  expect(drawn[0]).toHaveLength(2);
  await expect(page.getByText(TWO_NOT_ON_MAP, { exact: true })).toBeVisible();
});

test("RV5.5: a position added to a Stop, then removed, shows at the next state of the page, without a new framing", async ({ db, page, placed }) => {
  // The device holds Tom, without a car: a tap on a free seat of Sophie's car boards him, « Annuler » takes him out.
  const token = newToken();
  const tom = await seedPerson(db, placed.id, { firstName: "Tom" }, token);
  await seedPlacement(db, { personId: tom.id, eventId: placed.id, leg: "aller", rideId: null });
  const marc = await seedCar(db, placed.id, "Marc", { position: around(placed.place, { east: 3000 }), departureTime: "08:00:00" });
  await seedCar(db, placed.id, "Sophie", { position: around(placed.place, { north: 1500 }), location: "Gare", departureTime: "09:00:00" });
  const stop = await seedStop(db, placed.id, marc, { location: "Prelles boucherie", time: "08:25:00" });
  await holdToken(page, placed.id, token);

  await page.goto(`/e/${placed.id}`);
  const map = await openMap(page, mapName("aller", "2 voitures"));
  await expect(stops(map)).toHaveCount(0);
  await expect(page.getByText(ONE_NOT_ON_MAP, { exact: true })).toBeVisible();
  const marcPoint = map.getByRole("button", { name: /^Voiture de Marc, départ : / });
  const before = await anchorIn(map, marcPoint);

  const position = around(placed.place, { east: 2000, north: 500 });
  await db.updateTable("stop").set({ location_lat: position.lat, location_lng: position.lng }).where("id", "=", stop).execute();
  const panel = page.getByRole("tabpanel");
  await panel.getByRole("article", { name: "Voiture de Sophie", exact: true }).getByRole("button", { name: /^Place libre/ }).first().click();
  await expect(stops(map)).toHaveCount(1);
  await expect(page.getByText(ONE_NOT_ON_MAP, { exact: true })).toHaveCount(0);
  await expect(lines(map)).toHaveCount(2);
  // The map did not move: Marc's point is where it was.
  expect(near(await anchorIn(map, marcPoint), before)).toBe(true);

  await db.updateTable("stop").set({ location_lat: null, location_lng: null }).where("id", "=", stop).execute();
  await page.locator("[data-message-bar]").getByRole("button", { name: "Annuler" }).click();
  await expect(stops(map)).toHaveCount(0);
  await expect(page.getByText(ONE_NOT_ON_MAP, { exact: true })).toBeVisible();
  await expect(lines(map)).toHaveCount(2);
  expect(near(await anchorIn(map, marcPoint), before)).toBe(true);
});

test.describe("option off", () => {
  test.use({ eventFields: { stopsEnabled: false } });

  test("RV5.1: the option off, no round and no sentence, whatever the database holds", async ({ db, page, placed }) => {
    const marc = await seedCar(db, placed.id, "Marc", { position: around(placed.place, { east: 3000 }), departureTime: "08:00:00" });
    await seedStop(db, placed.id, marc, { location: "Prelles boucherie", time: "08:25:00", position: around(placed.place, { east: 2000 }) });
    await seedStop(db, placed.id, marc, { location: "Monétier", time: "08:50:00" });

    await page.goto(`/e/${placed.id}`);
    const map = await openMap(page, mapName("aller", "1 voiture"));

    await expect(stops(map)).toHaveCount(0);
    await expect(points(map)).toHaveCount(1);
    await expect(lines(map)).toHaveCount(1);
    await expect(page.getByText(/de RDV/)).toHaveCount(0);
  });
});
