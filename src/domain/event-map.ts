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
/** The margin around the points, in CSS pixels. */
const FIT_PADDING = 32;

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
  /** Less than 25 m from the flag: no line, and its label goes under the flag. */
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
 * The map of a leg, its cars in the order of the cards. A car with a position joins the
 * first point, in that order, whose position (its first car's) is less than 25 m from its
 * own; otherwise it opens a point. A car without a position has none.
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
    const point = points.find((each) => samePoint(each.position, position));
    if (point) point.cars.push(car);
    else points.push({ position, cars: [car], atFlag: samePoint(flag, position) });
  }
  return { flag, points, onMap: cars.length - notOnMap, notOnMap };
}

/** The view on opening: the flag alone, or the box of the flag and every point. */
export type Framing =
  | { kind: "flag"; center: Position; zoom: number }
  | { kind: "bounds"; south: number; west: number; north: number; east: number; padding: number; maxZoom: number };

export function framing(flag: Position, points: readonly { position: Position }[]): Framing {
  if (points.length === 0) return { kind: "flag", center: flag, zoom: FLAG_ZOOM };
  const all = [flag, ...points.map((point) => point.position)];
  const lats = all.map((each) => each.lat);
  const lngs = all.map((each) => each.lng);
  return {
    kind: "bounds",
    south: Math.min(...lats),
    west: Math.min(...lngs),
    north: Math.max(...lats),
    east: Math.max(...lngs),
    padding: FIT_PADDING,
    maxZoom: MAX_FIT_ZOOM,
  };
}
