import type { Locator } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedRide } from "@/db/test-participants";
import type { Position } from "@/domain/place";
import { around, FLAG, inside, mapName, openMap, points, test } from "./event-map-points";
import { expect } from "./fixtures";

/*
 * #820, #829: the view on opening holds every label inside its margin, at the highest whole zoom
 * that does (`fittingZoom`), the margin on each side being half the widest label's exact width,
 * rounded up. CA1.3's cars of the aller, the event at `placeOf` its id; Marc is moved east, once
 * the map has measured its width and its labels, to a box that only just fits, or only just
 * does not. The project `e2e` is a Pixel 7.
 */

test.use({ locale: "fr-FR" });

const NAME = mapName("aller", "3 voitures");
/** `framing`'s margin on each side, before the labels. */
const FIT_PADDING = 32;
/** The zoom the box is sized at: Leaflet's own would be this one, the view's the one under it. */
const ZOOM = 13;

/** CA1.3's cars of the aller: Marc 3 km east (moved later), Zoé 600 m north, Sophie 10 m north, at the flag. */
async function seedCars(db: Kysely<Database>, eventId: string, place: Position) {
  const car = async (firstName: string, position: Position, location: string) => {
    const driver = await seedPerson(db, eventId, { firstName });
    return { person: driver.id, ride: await seedRide(db, eventId, driver.id, { position, location }) };
  };
  const marc = await car("Marc", around(place, { east: 3000 }), "Place de la mairie");
  await car("Zoé", around(place, { north: 600 }), "12 rue des Lilas");
  const sophie = await car("Sophie", around(place, { north: 10 }), "Parking du gymnase");
  return { marc: marc.ride, sophie: sophie.person };
}

/** Marc at the flag's latitude, `pixels` east of it at zoom `ZOOM` (EPSG:3857: the world is 256 px wide at zoom 0). */
async function moveMarc(db: Kysely<Database>, ride: string, place: Position, pixels: number) {
  const lng = place.lng + (pixels / (256 * 2 ** ZOOM)) * 360;
  await db.updateTable("ride").set({ location_lat: place.lat, location_lng: lng }).where("id", "=", ride).execute();
}

/**
 * The map's width, its labels' exact widths, and, for each of `texts` put in a copy of a label
 * of 3 free seats, its exact width and its `offsetWidth`, a whole number.
 */
function measure(map: Locator, texts: string[]) {
  return map.evaluate((container, texts) => {
    const buttons = Array.from(container.querySelectorAll<HTMLElement>(".leaflet-marker-pane .leaflet-marker-icon > button"));
    const sample = buttons.find((button) => button.textContent?.endsWith("3"))!;
    const candidates = texts.map((text) => {
      const copy = sample.cloneNode(true) as HTMLElement;
      copy.querySelector(".truncate")!.textContent = text;
      sample.parentElement!.append(copy);
      const measured = { text, exact: copy.getBoundingClientRect().width, offset: copy.offsetWidth };
      copy.remove();
      return measured;
    });
    return { width: container.clientWidth, labels: buttons.map((button) => button.getBoundingClientRect().width), candidates };
  }, texts);
}

/** The margin `framing` gives a label `width` px wide, half of it rounded up. */
const sideOf = (width: number) => Math.max(FIT_PADDING, Math.ceil(width / 2));

/** The zooms of the tiles in `map`: one, once framed. */
const zooms = (map: Locator) =>
  map.locator("img.leaflet-tile").evaluateAll((tiles) => [...new Set(tiles.map((tile) => Number(new URL((tile as HTMLImageElement).src).pathname.split("/")[2])))]);

/** The flag and every point inside the map's box. */
async function expectAllInside(map: Locator) {
  const view = (await map.boundingBox())!;
  for (const marker of [map.getByRole("img", { name: FLAG, exact: true }), ...(await points(map).all())]) {
    expect(inside((await marker.boundingBox())!, view)).toBe(true);
  }
}

test("#820: a box Leaflet's own zoom would take, by less than 1 % of a zoom, past its margin: the view takes the zoom under it, and holds every label", async ({
  db,
  page,
  placed,
}) => {
  const scene = await seedCars(db, placed.id, placed.place);
  await page.goto(`/e/${placed.id}`);
  const { width, labels } = await measure(await openMap(page, NAME), []);
  // 0.17 % wider than the room between the margins: Leaflet rounds to the next zoom within 1 %.
  await moveMarc(db, scene.marc, placed.place, (width - 2 * sideOf(Math.max(...labels))) * 1.0017);

  await page.reload();
  const map = await openMap(page, NAME);
  await expect.poll(() => zooms(map)).toEqual([ZOOM - 1]);
  await expectAllInside(map);
});

/** First names whose label may have a width just above an even number of pixels. */
const CANDIDATES = ["Maximilien", "Gwendoline", "Christophe", "Marguerite", "Bérengère", "Anne-Sophie", "Guillaume", "Philippine", "Clémentine", "Évangéline", "Hippolyte", "Ferdinand", "Wilhelmine", "Barthélemy", "Gaëtane", "Léopoldine"];

test("#829: the margin is half the widest label's exact width, rounded up: a box that fits only in the margin `offsetWidth` gives takes the zoom under it", async ({
  db,
  page,
  placed,
}) => {
  const scene = await seedCars(db, placed.id, placed.place);
  await page.goto(`/e/${placed.id}`);
  const { width, labels, candidates } = await measure(await openMap(page, NAME), CANDIDATES);
  // Wider than every label, and of a width `offsetWidth` rounds down to an even number: 104.3 px
  // read 104, a margin of 52 px for half a label of 52.15.
  const widest = Math.max(...labels);
  const label = candidates.find(({ exact, offset }) => exact > widest && sideOf(offset) < sideOf(exact));
  if (!label) throw new Error(`no first name of a width just above an even number: ${JSON.stringify(candidates)}`);
  await db.updateTable("person").set({ first_name: label.text }).where("id", "=", scene.sophie).execute();
  // Just inside the room `offsetWidth` would leave between the margins, 2 px more than the exact one does.
  await moveMarc(db, scene.marc, placed.place, width - 2 * sideOf(label.offset) - 0.1);

  await page.reload();
  const map = await openMap(page, NAME);
  await expect(points(map).getByText(label.text, { exact: true })).toBeVisible();
  await expect.poll(() => zooms(map)).toEqual([ZOOM - 1]);
  await expectAllInside(map);
});
