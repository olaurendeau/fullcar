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

/** What `stopsOf` and `routeOf` read of a Stop: its id, its time (`HH:MM:SS`), its position or `null`. */
export interface MapStop {
  id: string;
  time: string;
  position: Position | null;
}

/** A car with its Stops, the aller's only (epic #881). */
export interface StoppedCar extends MapCar {
  stops: readonly MapStop[];
}

/** A Stop on the map: its car, itself, and its position. */
export interface PlacedStop<Car extends StoppedCar> {
  car: Car;
  stop: Car["stops"][number];
  position: Position;
}

/** Stably: Stops at one time stay in the order they came in. */
function byTime<Stop extends MapStop>(stops: readonly Stop[]): Stop[] {
  return [...stops].sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}

/**
 * The Stops of the cars on the map (RV5.1, RV5.3): each positioned Stop of each car with a
 * position, the cars in the order of the cards, a car's Stops in the order of their times; and
 * `stopsNotOnMap`, the others: a Stop without a position, or any Stop of a car without one.
 * A Stop never goes through `mapOf`: it is grouped with no car and not with the flag, and two
 * Stops 10 m apart stay two (their grouping is `stopPointsOf`'s, RV5.6).
 */
export function stopsOf<Car extends StoppedCar>(cars: readonly Car[]): { stops: PlacedStop<Car>[]; stopsNotOnMap: number } {
  const stops: PlacedStop<Car>[] = [];
  let stopsNotOnMap = 0;
  for (const car of cars) {
    for (const stop of byTime<Car["stops"][number]>(car.stops)) {
      if (car.position === null || stop.position === null) stopsNotOnMap += 1;
      else stops.push({ car, stop, position: stop.position });
    }
  }
  return { stops, stopsNotOnMap };
}

/** One round of Stops on the map: the Stops of different cars less than 25 m apart, at the position of the first. */
export interface StopGroup<Car extends StoppedCar> {
  position: Position;
  /** In the order they came in: the cars of the cards, then their times. Never two of one car. */
  stops: PlacedStop<Car>[];
}

/**
 * The rounds of the Stops of `stopsOf` (RV5.4, RV5.6, Q2 of #881): a Stop joins the first round,
 * in order, whose position (its first Stop's) is less than 25 m from its own and which holds no
 * Stop of its car; otherwise it opens a round. Two Stops of one car stay two, 10 m apart or not.
 * A round is never grouped with a car nor with the flag: it does not go through `mapOf`.
 */
export function stopPointsOf<Car extends StoppedCar>(stops: readonly PlacedStop<Car>[]): StopGroup<Car>[] {
  const groups: StopGroup<Car>[] = [];
  for (const placed of stops) {
    const group = groups.find((each) => each.stops.every(({ car }) => car.id !== placed.car.id) && samePoint(each.position, placed.position));
    if (group) group.stops.push(placed);
    else groups.push({ position: placed.position, stops: [placed] });
  }
  return groups;
}

/**
 * The line of a car through its Stops (RV5.2, Q4 of #881): its position, its positioned Stops in
 * the order of their times, then the flag. Nothing for a car without a position.
 */
export function routeOf(car: StoppedCar, flag: Position): Position[] {
  if (car.position === null) return [];
  return [car.position, ...byTime(car.stops).flatMap((stop) => (stop.position ? [stop.position] : [])), flag];
}

/**
 * The free seats a point shows on its label (#655, CA1.21): its car's, or, grouped, the sum of
 * its cars', 0 when all are full. Each car's are the board's `freeSeats`, its card's.
 */
export function freeSeatsOf(point: { cars: readonly { freeSeats: number }[] }): number {
  return point.cars.reduce((sum, car) => sum + car.freeSeats, 0);
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
 * point, label or point's button is under the credits (CA3.7). On the left and right, half the
 * widest label `halfLabel` when it is more, a label being centred on its point: its badge, at
 * its right end, is not cut by the map's edge (#655, CA1.3). The Stops (`stops`) are in the box
 * as the points are (RV5.1).
 */
export function framing(
  flag: Position,
  points: readonly { position: Position; atFlag: boolean }[],
  credits: number,
  halfLabel = 0,
  stops: readonly { position: Position }[] = [],
): Framing {
  if (points.length === 0 && stops.length === 0) return { kind: "flag", center: flag, zoom: FLAG_ZOOM };
  const all = [flag, ...points.map((point) => point.position), ...stops.map((stop) => stop.position)];
  const lats = all.map((each) => each.lat);
  const lngs = all.map((each) => each.lng);
  const bottom = credits + (points.some((point) => point.atFlag) ? FLAG_POINT_PADDING : FIT_PADDING);
  const side = Math.max(FIT_PADDING, Math.ceil(halfLabel));
  return {
    kind: "bounds",
    south: Math.min(...lats),
    west: Math.min(...lngs),
    north: Math.max(...lats),
    east: Math.max(...lngs),
    padding: { top: FIT_PADDING, right: side, bottom, left: side },
    maxZoom: MAX_FIT_ZOOM,
  };
}

/** A tile of the map, in CSS pixels: the world is this wide at zoom 0 (EPSG:3857, Leaflet's). */
const TILE_SIZE = 256;

/** The Web Mercator ordinate of `lat`, on a sphere of radius 1, growing to the north. */
function mercator(lat: number): number {
  return Math.log(Math.tan(Math.PI / 4 + radians(lat) / 2));
}

/**
 * The highest whole zoom, `view.maxZoom` at most, at which the box of `view` holds, inside its
 * padding, in a map `width` × `height` px: 0 when no zoom does. Leaflet's own zoom for a box
 * (`getBoundsZoom`) takes the next one when the box would need less than 1 % of a zoom less:
 * the box then passes its padding by up to 0.7 %, and a label at its edge leaves the view (#820).
 */
export function fittingZoom(view: Extract<Framing, { kind: "bounds" }>, width: number, height: number): number {
  const { top, right, bottom, left } = view.padding;
  const room = { x: width - left - right, y: height - top - bottom };
  if (room.x <= 0 || room.y <= 0) return 0;
  // The box's size at zoom 0, in CSS pixels.
  const span = {
    x: ((view.east - view.west) / 360) * TILE_SIZE,
    y: ((mercator(view.north) - mercator(view.south)) / (2 * Math.PI)) * TILE_SIZE,
  };
  const most = (pixels: number, atZero: number) => (atZero > 0 ? Math.floor(Math.log2(pixels / atZero)) : Infinity);
  return Math.max(0, Math.min(view.maxZoom, most(room.x, span.x), most(room.y, span.y)));
}

/**
 * The bubble's highest, in a map `height` px high whose credits are `credits` px high: from
 * `BUBBLE_INSET` under the top to `BUBBLE_INSET` above the credits (v22). It scrolls beyond.
 */
export function bubbleMaxHeight(height: number, credits: number): number {
  return height - 2 * BUBBLE_INSET - credits;
}
