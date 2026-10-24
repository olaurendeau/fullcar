/**
 * What the map's end-to-end tests share (event-map v18): an event of the test's own at
 * `placeOf` its id, its cars around it, the map opened, and where its points, lines and flag are.
 */
import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedEvent, type SeededEvent } from "@/db/test-events";
import { seedPerson, seedRide } from "@/db/test-participants";
import type { Leg } from "@/domain/leg";
import type { Position } from "@/domain/place";
import { generatePublicId } from "@/domain/public-id";
import { expect, test as base } from "./fixtures";
import { placeOf } from "./ign";

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

/** Opens the map of the shown leg, clicked again only while it stays folded (a click before hydration), until a tile shows. */
export async function openMap(page: Page, name: string): Promise<Locator> {
  const button = page.getByRole("tabpanel").getByRole("button", { name: "Carte", exact: true });
  await expect(async () => {
    if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true", { timeout: 500 });
  }).toPass();
  const map = page.getByRole("region", { name, exact: true });
  await expect(map.locator(".leaflet-tile-loaded").first()).toBeVisible();
  return map;
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

/** The labels of what takes the focus inside `map`, its container excluded, in the DOM's order. */
export function focusableIn(map: Locator): Promise<(string | null)[]> {
  return map.evaluate((container) =>
    Array.from(container.querySelectorAll<HTMLElement | SVGElement>("*"))
      .filter((element) => element.tabIndex >= 0)
      .map((element) => element.getAttribute("aria-label")),
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
