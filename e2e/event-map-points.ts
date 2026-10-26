/**
 * What the map's end-to-end tests share (event-map v18): an event of the test's own at
 * `placeOf` its id, its cars around it, the map opened, and where its points, lines and flag are.
 */
import type { Locator, Page, Request } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedEvent, type SeededEvent } from "@/db/test-events";
import { seedPerson, seedRide } from "@/db/test-participants";
import type { Leg } from "@/domain/leg";
import type { Position } from "@/domain/place";
import { generatePublicId } from "@/domain/public-id";
import { holdActions, holdToken, newToken } from "./device";
import { expect, test as base } from "./fixtures";
import { placeOf } from "./tiles";

/** An event of the test's own, at `placeOf` its id; `eventFields` as the fixture's. */
export const test = base.extend<{ placed: SeededEvent & { place: Position } }>({
  placed: async ({ db, eventFields }, provide) => {
    const id = generatePublicId();
    const place = placeOf(id);
    const event = await seedEvent(db, { ...eventFields, locationPosition: place }, undefined, () => id);
    await provide({ ...event, place });
    await db.deleteFrom("event").where("id", "=", event.id).execute();
  },
});

export const FLAG = "Lieu de l’événement : Gymnase des Gayeulles";
export const mapName = (leg: Leg, cars: string) =>
  `${leg === "aller" ? "Carte de l’aller" : "Carte du retour"} : le lieu de l’événement et ${cars}`;

/** The metres of a degree of latitude (the sphere of `distanceMetres`). */
const METRES_PER_DEGREE = (6_371_008.8 * Math.PI) / 180;

/** `north` and `east` metres from `from`. */
export function around(from: Position, { north = 0, east = 0 }: { north?: number; east?: number }): Position {
  return {
    lat: from.lat + north / METRES_PER_DEGREE,
    lng: from.lng + east / (METRES_PER_DEGREE * Math.cos((from.lat * Math.PI) / 180)),
  };
}

/** A car driven by `firstName`, with the place and time a test gives it; its id. */
export async function seedCar(
  db: Kysely<Database>,
  eventId: string,
  firstName: string,
  fields: { position: Position | null; location?: string; leg?: Leg; departureTime?: `${string}:00`; seats?: number },
): Promise<string> {
  const driver = await seedPerson(db, eventId, { firstName });
  return seedRide(db, eventId, driver.id, fields);
}

/**
 * Marc's car, 250 m north of `place`, then Nina's (1 free seat) and Paul's (2) at one parking
 * 350 m east: two points, one grouped (« 2 voitures : Nina, Paul, 3 places libres », the
 * design's case), all in a view at zoom 15, `framing`'s most.
 */
export async function seedParking(db: Kysely<Database>, eventId: string, place: Position): Promise<void> {
  await seedCar(db, eventId, "Marc", { position: around(place, { north: 250 }), location: "Gare", departureTime: "08:00:00" });
  const parking = around(place, { east: 350 });
  await seedCar(db, eventId, "Nina", { position: parking, location: "Parking du marché", departureTime: "09:00:00", seats: 1 });
  await seedCar(db, eventId, "Paul", { position: { ...parking }, location: "Parking du marché", departureTime: "10:00:00", seats: 2 });
}

/**
 * The map of the shown leg, open since the arrival (#653), clicked only while it stays folded,
 * its box scrolled into the screen, where it starts once the page is settled, until a tile shows.
 */
export async function openMap(page: Page, name: string): Promise<Locator> {
  const button = page.getByRole("tabpanel").getByRole("button", { name: "Carte", exact: true });
  await expect(async () => {
    if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true", { timeout: 500 });
  }).toPass();
  const map = page.getByRole("region", { name, exact: true });
  // Scrolled again while « Vos inscriptions » or the organiser area, arriving above, push it down.
  await expect(async () => {
    await map.scrollIntoViewIfNeeded();
    await expect(map.locator(".leaflet-tile-loaded").first()).toBeVisible({ timeout: 1_000 });
  }).toPass();
  return map;
}

/** A tile request, to our route. */
export const isTile = (request: Request) => new URL(request.url()).pathname.startsWith("/tuiles/");

/** How many of `requests` brought Leaflet: its class names, in its script and in its style sheet, none of ours has. */
export async function leafletCount(requests: Request[]): Promise<number> {
  const texts = await Promise.all(
    requests
      .filter((request) => ["script", "stylesheet"].includes(request.resourceType()))
      .map((request) => request.response().then((response) => response?.text() ?? "").catch(() => "")),
  );
  return texts.filter((text) => text.includes("leaflet-control-zoom")).length;
}

/** From now on, the page's requests: how many brought Leaflet, and how many asked for a tile. */
export function watchMap(page: Page) {
  const requests: Request[] = [];
  page.on("request", (request) => requests.push(request));
  return { leaflet: () => leafletCount(requests), tiles: () => requests.filter(isTile).length };
}

/** Once what the page did so far has sent what it would: two frames for its effects, then half a second. */
export async function idle(page: Page) {
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await page.waitForTimeout(500);
}

/**
 * Arrives at event `id`'s `path` with the map not started (CA1.20): the device has a token of
 * its own, and every server action, the read of its persons first, is held, so that the page is
 * not settled. The read sent, the page is hydrated; `settle` lets the actions go.
 */
export async function arriveWaiting(page: Page, id: string, path = `/e/${id}`): Promise<() => void> {
  await holdToken(page, id, newToken());
  const settle = await holdActions(page);
  const read = page.waitForRequest((request) => request.method() === "POST" && !!request.headers()["next-action"]);
  await page.goto(path);
  await read;
  await expect(page.locator(".leaflet-container")).toHaveCount(0);
  return settle;
}

/** The car points of `map`, in the DOM's order: an open bubble's buttons are not points. */
export const points = (map: Locator) => map.locator(".leaflet-marker-pane .leaflet-marker-icon > button");
/** The lines of `map`. */
export const lines = (map: Locator) => map.locator(".leaflet-overlay-pane path");

export type Box = { x: number; y: number; width: number; height: number };
export const centre = (box: Box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
export const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
export const inside = (inner: Box, outer: Box) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

/** The credits' link, the last of the map in the Tab order (#558, CA3.7), by its text. */
export const OSM_LINK = "© OpenStreetMap (s’ouvre dans un nouvel onglet)";

/** The labels of what takes the focus inside `map`, its container excluded, in the DOM's order; a link without one, its text. */
export function focusableIn(map: Locator): Promise<(string | null)[]> {
  return map.evaluate((container) =>
    Array.from(container.querySelectorAll<HTMLElement | SVGElement>("*"))
      .filter((element) => element.tabIndex >= 0)
      .map((element) => element.getAttribute("aria-label") ?? (element.tagName === "A" ? element.textContent : null)),
  );
}

/** Whether a line of `map` goes from `a` to `b`: its box has them at opposite corners, to 2 px. */
export async function joins(map: Locator, a: { x: number; y: number }, b: { x: number; y: number }): Promise<boolean> {
  const boxes = await lines(map).evaluateAll((paths) => paths.map((path) => path.getBoundingClientRect().toJSON() as Box));
  const near = (u: number, v: number) => Math.abs(u - v) <= 2;
  return boxes.some(
    (box) =>
      near(box.x, Math.min(a.x, b.x)) &&
      near(box.y, Math.min(a.y, b.y)) &&
      near(box.x + box.width, Math.max(a.x, b.x)) &&
      near(box.y + box.height, Math.max(a.y, b.y)),
  );
}

/** Where `marker` (a point or the flag) is anchored: the centre of the icon Leaflet places there. */
export async function anchor(marker: Locator): Promise<{ x: number; y: number }> {
  return marker.evaluate((element) => {
    const { x, y, width, height } = element.closest(".leaflet-marker-icon")!.getBoundingClientRect();
    return { x: x + width / 2, y: y + height / 2 };
  });
}
