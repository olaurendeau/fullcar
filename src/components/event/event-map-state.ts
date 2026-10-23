/*
 * A leg's map when the page applies a new state (docs/design/event-map/, v11, the « carte »
 * rows of « Mises à jour et focus »; design « Conception technique », § 6): between two
 * outputs of `mapOf`, the points kept, moved, created and removed, whether to reframe, to
 * close the bubble, and where the focus goes. Pure functions: the map draws what they say.
 */
import { distanceMetres, SAME_POSITION_METRES, type EventMapPoints, type MapCar, type MapPoint } from "@/domain/event-map";
import type { Position } from "@/domain/place";

/**
 * What has the focus in the map: its container, a point, a car's button of the open bubble,
 * or its « Fermer ». A point is named by its key (`pointKey`).
 */
export type MapFocus = { kind: "container" } | { kind: "point"; key: string } | { kind: "bubble"; car: string } | { kind: "close" };

export interface MapView {
  /** `null`: the focus is not in the map. */
  focus: MapFocus | null;
  /** The key of the point whose bubble is open. */
  bubble: string | null;
  /** Somebody moved or zoomed the map since it opened. */
  touched: boolean;
}

/** The same element (`kept`, its name redrawn), the same element at a new position (`setLatLng`), or a new one. */
export type PointChange = "kept" | "moved" | "created";

export interface MapUpdate<Car extends MapCar> {
  /** The points of the new state, in the order of the cards. */
  points: { key: string; point: MapPoint<Car>; change: PointChange }[];
  /** The keys of the points that go, in their former order. */
  removed: string[];
  /**
   * The points' elements are no longer in the order of the cards: the kept ones stay in their
   * order, and the map adds the created ones last, in the order of `points`.
   */
  reorder: boolean;
  /** Fit the view again (`framing`): a car arrived on the map, or the flag moved, and nobody touched it. */
  reframe: boolean;
  /** The open bubble's list changed: it closes. */
  closeBubble: boolean;
  /**
   * Where the focus is once the map is updated, to be given back if a move took it away; `null`
   * when it was not in the map. Never `<body>`: failing all else, the container.
   */
  focus: MapFocus | null;
}

/** A point is its cars: the same cars in the same order are the same point, wherever it is. */
export function pointKey(point: MapPoint<MapCar>): string {
  return point.cars.map((car) => car.id).join(" ");
}

function samePosition(a: Position, b: Position): boolean {
  return a.lat === b.lat && a.lng === b.lng;
}

function carIds<Car extends MapCar>(map: EventMapPoints<Car>): Set<string> {
  return new Set(map.points.flatMap((point) => point.cars.map((car) => car.id)));
}

const CONTAINER: MapFocus = { kind: "container" };

/**
 * The focus a point had: to the point that now holds the first of its cars still on the map,
 * itself while it stays; none left, to the container.
 */
function pointFocus<Car extends MapCar>(key: string, before: EventMapPoints<Car>, after: EventMapPoints<Car>): MapFocus {
  const cars = before.points.find((point) => pointKey(point) === key)?.cars ?? [];
  for (const { id } of cars) {
    const holder = after.points.find((point) => point.cars.some((car) => car.id === id));
    if (holder) return { kind: "point", key: pointKey(holder) };
  }
  return CONTAINER;
}

/** The focus the closed bubble had: the first point less than 25 m from its point's position, else the container. */
function bubbleFocus<Car extends MapCar>(key: string | null, before: EventMapPoints<Car>, after: EventMapPoints<Car>): MapFocus {
  const position = before.points.find((point) => pointKey(point) === key)?.position;
  const there = position && after.points.find((point) => distanceMetres(point.position, position) < SAME_POSITION_METRES);
  return there ? { kind: "point", key: pointKey(there) } : CONTAINER;
}

/**
 * The map going from `before` to `after`, two outputs of `mapOf` for the same leg, with what
 * had the focus, the open bubble, and whether somebody touched the map.
 */
export function mapUpdate<Car extends MapCar>(
  before: EventMapPoints<Car>,
  after: EventMapPoints<Car>,
  view: MapView,
): MapUpdate<Car> {
  const former = new Map(before.points.map((point) => [pointKey(point), point]));
  const points = after.points.map((point) => {
    const key = pointKey(point);
    const was = former.get(key);
    const change: PointChange = !was ? "created" : samePosition(was.position, point.position) ? "kept" : "moved";
    return { key, point, change };
  });
  const keys = new Set(points.map(({ key }) => key));
  const removed = [...former.keys()].filter((key) => !keys.has(key));

  // As the map holds them: the kept ones in their order, then the created ones. As many as `points`.
  const staying = [...former.keys()].filter((key) => keys.has(key));
  const created = points.filter(({ change }) => change === "created").map(({ key }) => key);
  const reorder = [...staying, ...created].some((key, n) => key !== points[n].key);

  const onMapBefore = carIds(before);
  const arrived = [...carIds(after)].some((id) => !onMapBefore.has(id));
  const reframe = !view.touched && (arrived || !samePosition(before.flag, after.flag));

  const bubbleStays = view.bubble !== null && keys.has(view.bubble);
  const closeBubble = view.bubble !== null && !bubbleStays;

  const { focus } = view;
  let next: MapFocus | null;
  if (focus === null || focus.kind === "container") next = focus;
  else if (focus.kind === "point") next = pointFocus(focus.key, before, after);
  else next = bubbleStays ? focus : bubbleFocus(view.bubble, before, after);

  return { points, removed, reorder, reframe, closeBubble, focus: next };
}
