/*
 * A leg's map when the page applies a new state (docs/design/event-map/, v18, the « carte »
 * rows of « Mises à jour et focus »; design « Conception technique », § 6): between two
 * outputs of `mapOf`, the points kept, moved, created and removed, whether to reframe, to
 * close the bubble, and where the focus goes. Then (#483) Leaflet's import and the tiles'
 * notice, the rows « Leaflet : … » and « tuiles : … », the import one for the page since
 * #553; (#653) when the page is settled; and (#722) which point's label is raised. Pure
 * functions: the map draws what they say.
 */
import { distanceMetres, SAME_POSITION_METRES, type EventMapPoints, type MapCar, type MapPoint } from "@/domain/event-map";
import type { Position } from "@/domain/place";
import type { DeviceStatus } from "@/domain/tap";

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

/** What an update reads of `mapOf`'s output: the flag and the points, as the map draws them. */
export type MapPoints<Car extends MapCar> = Pick<EventMapPoints<Car>, "flag" | "points">;

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

/**
 * A point is its cars: the same cars are the same point, wherever it is and whatever the order
 * of their cards, which only changes the order of its bubble.
 */
export function pointKey(point: MapPoint<MapCar>): string {
  return point.cars
    .map((car) => car.id)
    .sort()
    .join(" ");
}

/** A car of a point always has a position: `null` is only allowed for the type. */
function samePosition(a: Position | null, b: Position | null): boolean {
  return a?.lat === b?.lat && a?.lng === b?.lng;
}

function carIds<Car extends MapCar>(map: MapPoints<Car>): Set<string> {
  return new Set(map.points.flatMap((point) => point.cars.map((car) => car.id)));
}

const CONTAINER: MapFocus = { kind: "container" };

/**
 * The focus a point had: to the point that now holds « cette voiture », the first of its cars
 * whose position changed; none moved, the first still on the map, so itself while it stays;
 * none left, to the container.
 */
function pointFocus<Car extends MapCar>(key: string, before: MapPoints<Car>, after: MapPoints<Car>): MapFocus {
  const cars = before.points.find((point) => pointKey(point) === key)?.cars ?? [];
  const still = cars.flatMap((was) =>
    after.points.flatMap((holder) =>
      holder.cars.filter((car) => car.id === was.id).map((car) => ({ holder, moved: !samePosition(was.position, car.position) })),
    ),
  );
  const target = still.find(({ moved }) => moved) ?? still[0];
  return target ? { kind: "point", key: pointKey(target.holder) } : CONTAINER;
}

/** The focus the closed bubble had: the first point less than 25 m from its point's position, else the container. */
function bubbleFocus<Car extends MapCar>(key: string | null, before: MapPoints<Car>, after: MapPoints<Car>): MapFocus {
  const position = before.points.find((point) => pointKey(point) === key)?.position;
  const there = position && after.points.find((point) => distanceMetres(point.position, position) < SAME_POSITION_METRES);
  return there ? { kind: "point", key: pointKey(there) } : CONTAINER;
}

/**
 * The map going from `before` to `after`, two outputs of `mapOf` for the same leg, with what
 * had the focus, the open bubble, and whether somebody touched the map.
 */
export function mapUpdate<Car extends MapCar>(before: MapPoints<Car>, after: MapPoints<Car>, view: MapView): MapUpdate<Car> {
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

/**
 * The flag's icon class: above every label, whatever the `z-index` Leaflet gives a marker by
 * its latitude, which a class with `!` beats.
 */
export const FLAG_LAYER = "z-1000!";

/**
 * A point's icon classes, one at a time (event-map v32, #722): in the order of the cards, as the
 * DOM stacks them; raised, above the other labels and under the flag; its bubble open, above
 * the flag (amendment 6 on #653). Each Leaflet icon is a stacking context of its own (its
 * `transform`): its label and its bubble are compared to the others by its class alone.
 */
export const POINT_LAYERS = ["z-auto!", "z-999!", "z-1001!"] as const;
export type PointLayer = (typeof POINT_LAYERS)[number];

/** What raises a point's label. */
export interface PointRaise {
  /** A mouse is over its button: a touch hovers nothing. */
  hovered: boolean;
  /** The focus is in its icon: on its button, or in its bubble. */
  focused: boolean;
  /** Its bubble is open. */
  open: boolean;
}

/**
 * The one class of a point's icon (CA1.23): it replaces the one before, never sits beside it,
 * since two `!important` classes for `z-index` would leave the order of the style sheet to decide.
 */
export function pointLayer({ hovered, focused, open }: PointRaise): PointLayer {
  if (open) return "z-1001!";
  return hovered || focused ? "z-999!" : "z-auto!";
}

/**
 * Leaflet's import, one for the page and both legs (CA2.10, `leaflet-import`): not asked for
 * yet, « Chargement de la carte… », the notice, or the map.
 */
export type LeafletPhase = "idle" | "loading" | "failed" | "ready";

export interface LeafletState {
  phase: LeafletPhase;
  /** The failures in a row, for the page: none since the last success. */
  failures: number;
  /** Failed from the second time in a row, online: « La carte n’a toujours pas pu se charger. » and « Recharger la page ». */
  again: boolean;
}

export const LEAFLET_IDLE: LeafletState = { phase: "idle", failures: 0, again: false };

/** A map started, « Réessayer » pressed, or the import ended. */
export type LeafletEvent = "open" | "retry" | "loaded" | "failed";

/**
 * Where the focus goes: the loading box (`tabindex="-1"`), « Carte », the notice's « Réessayer »
 * or its « Recharger la page »; `null`, it stays.
 */
export type LeafletFocus = "box" | "toggle" | "retry" | "reload" | null;

/**
 * The page's import after `event` (CA2.8): the first start of a map imports, and « Réessayer »
 * imports again; the import ended, the map, or the notice, « toujours » from the second failure
 * in a row while `online` (`navigator.onLine`), the first one offline. An event that nothing
 * waits for changes nothing: the same state.
 */
export function leafletStep(state: LeafletState, event: LeafletEvent, online: boolean): LeafletState {
  if (event === "open") return state.phase === "idle" ? { ...state, phase: "loading" } : state;
  if (event === "retry") return state.phase === "failed" ? { ...state, phase: "loading" } : state;
  if (state.phase !== "loading") return state;
  if (event === "loaded") return { phase: "ready", failures: 0, again: false };
  const failures = state.failures + 1;
  return { phase: "failed", failures, again: online && failures >= 2 };
}

/**
 * Where a leg's focus goes when the import goes from `before` to `after` (CA2.8): « Réessayer »
 * gives it to the box, which takes the place of the notice and its buttons; the import ended,
 * the box goes, and its focus with it (`focusInBox`): to « Carte » once loaded, to « Recharger
 * la page » under the notice « toujours », to « Réessayer » under the first one. A leg whose box
 * did not have it, the hidden one say, leaves it where it is.
 */
export function leafletFocus(before: LeafletState, event: LeafletEvent, after: LeafletState, focusInBox: boolean): LeafletFocus {
  if (before.phase === after.phase || event === "open") return null;
  if (event === "retry") return "box";
  if (!focusInBox) return null;
  if (after.phase === "ready") return "toggle";
  return after.again ? "reload" : "retry";
}

/** A map's tiles: whether a tile of the view loading now failed, and whether the notice shows. */
export interface TilesView {
  failing: boolean;
  notice: boolean;
}

export const TILES_QUIET: TilesView = { failing: false, notice: false };

/**
 * The tile layer's `loading` (a view starts loading), `tileerror`, `load` (the view ended, its
 * failed tiles included), or « Réessayer », which asks for every tile again.
 */
export type TilesEvent = "loading" | "tileerror" | "load" | "retry";

/**
 * The tiles' notice after `event` (CA2.4): shown when a view ends loading with at least one
 * tile in error, gone when a view ends without one, never in between, so that it does not
 * blink. Gone while its « Réessayer » had the focus (`retryFocused`): to the map's container.
 */
export function tilesStep(view: TilesView, event: TilesEvent, retryFocused: boolean): { view: TilesView; focus: "container" | null } {
  if (event === "loading" || event === "retry") return { view: { ...view, failing: false }, focus: null };
  if (event === "tileerror") return { view: { ...view, failing: true }, focus: null };
  const gone = view.notice && !view.failing;
  return { view: { ...view, notice: view.failing }, focus: gone && retryFocused ? "container" : null };
}

/**
 * Whether the page is settled (event-map v29, « la page posée », CA1.2, CA1.20): the device's
 * persons read, or none to read, or their read failed; and on `/e/{id}/admin`, the first check of
 * the link over (`linkChecking` false). Until then, « Vos inscriptions » and the organiser area are
 * still to come above the map, and would push its box under the fold: no map starts.
 */
export function pageSettled(device: DeviceStatus, linkChecking: boolean): boolean {
  return !linkChecking && (device === "none" || device === "ready" || device === "failed");
}
