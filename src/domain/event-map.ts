/**
 * The points of a leg's map (epic #238, design « Conception technique », § 5): the event's
 * place, the flag, and a point per group of cars less than 25 m apart. No words and no
 * Leaflet here: the map draws what these functions say. Plain data, for the browser.
 */
import type { Position } from "./place";

/** Closer than this, two positions are one point: below it, even the highest zoom merges them. */
export const SAME_POSITION_METRES = 25;

/** The mean radius of the Earth, in metres. */
const EARTH_RADIUS_METRES = 6_371_008.8;

/** The flag alone: about a town. */
const FLAG_ZOOM = 14;
/** Fitting the points never zooms in further than this. */
const MAX_FIT_ZOOM = 15;
/** The margin around the points, in CSS pixels; at the bottom, above the credits. */
const FIT_PADDING = 32;
/**
 * The bottom margin above the credits when the flag has a point: its button hangs from 16 px
 * under the flag and is 44 px high, down to 60 px under the flag's place (v22).
 */
const FLAG_POINT_PADDING = 64;
/** The bubble's distance from the map's top and right edges, and from the credits, in CSS pixels. */
export const BUBBLE_INSET = 10;

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** The great-circle distance between two positions, in metres (haversine, on a sphere). */
export function distanceMetres(a: Position, b: Position): number {
  const halfLat = Math.sin(radians(b.lat - a.lat) / 2);
  const halfLng = Math.sin(radians(b.lng - a.lng) / 2);
  const h = halfLat ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * halfLng ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.sqrt(h));
}

function samePoint(a: Position, b: Position): boolean {
  return distanceMetres(a, b) < SAME_POSITION_METRES;
}

/** What `mapOf` reads of a car: its id, and its position or `null`. */
export interface MapCar {
  id: string;
  position: Position | null;
}

/** A point of the map: its cars, in the order of the cards, at the position of the first. */
export interface MapPoint<Car extends MapCar> {
  position: Position;
  cars: Car[];
  /** The flag's point, its cars less than 25 m from it: no line, and its label goes under the flag. At most one. */
  atFlag: boolean;
}

export interface EventMapPoints<Car extends MapCar> {
  flag: Position;
  /** In the order of their first car's card. */
  points: MapPoint<Car>[];
  /** The cars on the map: the `count` of the map's name. */
  onMap: number;
  /** The cars without a position. */
  notOnMap: number;
}

/**
 * The map of a leg, its cars in the order of the cards. The flag first (event-map v18, CA1.15):
 * every car less than 25 m from the flag is in its one point, even 25 m or more from another,
 * whose two labels would otherwise be drawn in the same place. Any other car joins the first
 * point, in that order, not at the flag, whose position (its first car's) is less than 25 m
 * from its own; otherwise it opens a point. A car without a position has none.
 */
export function mapOf<Car extends MapCar>(flag: Position, cars: readonly Car[]): EventMapPoints<Car> {
  const points: MapPoint<Car>[] = [];
  let notOnMap = 0;
  for (const car of cars) {
    const position = car.position;
    if (position === null) {
      notOnMap += 1;
      continue;
    }
    const atFlag = samePoint(flag, position);
    const point = points.find((each) => each.atFlag === atFlag && (atFlag || samePoint(each.position, position)));
    if (point) point.cars.push(car);
    else points.push({ position, cars: [car], atFlag });
  }
  return { flag, points, onMap: cars.length - notOnMap, notOnMap };
}

/** A margin of the view, side by side, in CSS pixels. */
export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** The view on opening: the flag alone, or the box of the flag and every point. */
export type Framing =
  | { kind: "flag"; center: Position; zoom: number }
  | { kind: "bounds"; south: number; west: number; north: number; east: number; padding: Padding; maxZoom: number };

/**
 * The flag alone at zoom 14, or the box of the flag and every point, zoom 15 at most, 32 px
 * around. At the bottom, the credits' measured height `credits` more (24 px on one line, 48 on
 * two), and 32 px more again when the flag has a point under it (v22): after a framing, no
 * point, label or point's button is under the credits (CA3.7).
 */
export function framing(flag: Position, points: readonly { position: Position; atFlag: boolean }[], credits: number): Framing {
  if (points.length === 0) return { kind: "flag", center: flag, zoom: FLAG_ZOOM };
  const all = [flag, ...points.map((point) => point.position)];
  const lats = all.map((each) => each.lat);
  const lngs = all.map((each) => each.lng);
  const bottom = credits + (points.some((point) => point.atFlag) ? FLAG_POINT_PADDING : FIT_PADDING);
  return {
    kind: "bounds",
    south: Math.min(...lats),
    west: Math.min(...lngs),
    north: Math.max(...lats),
    east: Math.max(...lngs),
    padding: { top: FIT_PADDING, right: FIT_PADDING, bottom, left: FIT_PADDING },
    maxZoom: MAX_FIT_ZOOM,
  };
}

/**
 * The bubble's highest, in a map `height` px high whose credits are `credits` px high: from
 * `BUBBLE_INSET` under the top to `BUBBLE_INSET` above the credits (v22). It scrolls beyond.
 */
export function bubbleMaxHeight(height: number, credits: number): number {
  return height - 2 * BUBBLE_INSET - credits;
}
