/**
 * Leaflet, for a leg's map (epic #238, event-map v18, « Anatomie et accessibilité »). The only
 * file that imports `leaflet` and its style sheet, and it is reached by `import()` alone, at
 * the first opening of a map (CA1.2): until then, the page loads neither.
 * No words here: event-map.tsx gives them, translated.
 */
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { BUBBLE_INSET, bubbleMaxHeight, framing } from "@/domain/event-map";
import type { Position } from "@/domain/place";
import { mapUpdate, pointKey, type MapFocus, type TilesEvent } from "./event-map-state";

/** A car of a point: its button in a bubble says « Voiture de {prénom} », and is named what its card says. */
export interface PointCar {
  id: string;
  /** Its place's, as `mapOf` read it: at the next state, whether it moved. */
  position: Position | null;
  /** « Voiture de {prénom} ». */
  title: string;
  /** « Voiture de {prénom}, départ : {lieu}, {places} ». */
  name: string;
  /** Its free seats, formatted (`format.number`): its button's badge. */
  seats: string;
}

/**
 * A point of `mapOf`: where it is, its label, its name and its free seats; one car, the driver's
 * first name and the car's name; more, their number and « N voitures : {prénoms}, {places} »,
 * and a bubble (CA1.6).
 */
export interface CarPoint {
  position: Position;
  /** The flag's point: no line, and the label under the flag. */
  atFlag: boolean;
  label: string;
  name: string;
  /** Its car's free seats, or the sum of its cars', formatted (`format.number`): the label's badge (#655). */
  seats: string;
  /** In the order of the cards. */
  cars: PointCar[];
}

/** What a state of the page puts on the map: the event's place, its name, and the points of `mapOf`. */
export interface MapState {
  flag: Position;
  /** The flag's name, « Lieu de l’événement : {location} ». */
  flagLabel: string;
  /** In the order of their first car's card. */
  points: CarPoint[];
}

export interface EventMapOptions {
  /** The state the map opens on; then each one `update` is given. */
  state: MapState;
  zoomIn: string;
  zoomOut: string;
  /** « Fermer », the bubble's last button. */
  close: string;
  /**
   * Our credits, event-map.tsx's own element in `container`, no control of Leaflet's (v23): put
   * last in it, after « Zoom arrière » in the Tab order, with the points' gestures (#484); their
   * height, read at each framing and each resize, keeps the points and the bubble off them.
   */
  credits: HTMLElement;
  /** The media query of a touch screen, the one the two-finger sentence follows (CA1.11). */
  touchQuery: string;
  /** A car's point or a bubble's car button activated: to its card. */
  onCar: (id: string) => void;
  /** The tile layer's `loading`, `tileerror` and `load`, view by view (CA2.4): `tilesStep` reads them. */
  onTiles: (event: Exclude<TilesEvent, "retry">) => void;
}

export interface EventMapHandle {
  /**
   * The page applies a new state: the same map, its points kept, moved, created or removed as
   * `mapUpdate` says, by the table « Mises à jour et focus ».
   */
  update(state: MapState): void;
  /** To call when the container's size changes, as when its panel is shown again: a map made without a size is framed then. */
  resize(): void;
  /** « Réessayer » of the tiles' notice: every tile of the view asked for again. */
  retryTiles(): void;
  destroy(): void;
}

/** The last zoom our route serves (`tileOf`). */
const MAX_ZOOM = 18;
/** The whole grid, with `noWrap`: Leaflet never asks for a tile out of it. */
const WORLD: L.LatLngBoundsExpression = [
  [-90, -180],
  [90, 180],
];
/** The touch target of a zoom button, in CSS pixels (CA1.8). */
const ZOOM_TARGET = "44px";
/** A line, as the design draws it: straight, 2 px, #171717 at 70 %, and nothing happens on it. */
const LINE: L.PolylineOptions = { color: "#171717", opacity: 0.7, weight: 2, interactive: false };
/** The bubble, as the design draws it: `BUBBLE_INSET` from the map's top right corner, 210 px wide at most. */
const BUBBLE_WIDTH = 210;

/** Leaflet 1.9.4's keyboard handler, `L.Map.Keyboard`, which @types/leaflet does not declare. */
const LeafletKeyboard = (L.Map as unknown as { Keyboard: typeof L.Handler }).Keyboard;
type KeyboardHandler = L.Handler & { _map: L.Map; _focused: boolean; _onKeyDown(event: KeyboardEvent): void };

/**
 * Leaflet's keyboard, but its arrow keys pan at once (CA1.10, decision 24 of organizer-view),
 * and a press of the mouse gives the region the mouse's focus, without its ring (v27, #577).
 * Leaflet 1.9.4 has no option for it: its `_onKeyDown` calls `map.panBy(offset)`, animated for
 * 250 ms. Ours runs that same `_onKeyDown`, so Shift (three times the distance), the `maxBounds`
 * limit and + / − for zoom stay Leaflet's, with `panBy` made still for the time of the key.
 * Its `worldCopyJump` branch calls `panTo`, not `panBy`, and would stay animated: this map
 * does not set `worldCopyJump`.
 * This overrides an internal of Leaflet, and is safe only because package.json pins `leaflet`
 * to exactly 1.9.4: an upgrade reads this again, and e2e/event-map-touch.spec.ts tests the
 * arrows, Shift, + and −.
 * Leaflet's `_onMouseDown` focuses the region by script, and Chrome makes a focus by script
 * `:focus-visible` when the element it leaves is: after Tab to a point, a click lit the ring.
 * Ours asks `focusVisible: false`, which a browser without it ignores, and `preventScroll` in
 * place of Leaflet's `window.scrollTo` back; e2e/event-map-container.spec.ts tests it.
 */
const StillKeyboard = LeafletKeyboard.extend({
  _onMouseDown(this: KeyboardHandler) {
    if (this._focused) return;
    this._map.getContainer().focus({ preventScroll: true, focusVisible: false });
  },
  _onKeyDown(this: KeyboardHandler, event: KeyboardEvent) {
    const map = this._map;
    const panBy = map.panBy;
    map.panBy = (offset, options) => panBy.call(map, offset, { ...options, animate: false });
    try {
      (LeafletKeyboard.prototype as KeyboardHandler)._onKeyDown.call(this, event);
    } finally {
      // Back to the prototype's, no own property left on the map.
      delete (map as Partial<Pick<L.Map, "panBy">>).panBy;
    }
  },
}) as typeof L.Handler;

/**
 * A press on `element` neither drags nor zooms the map. One finger on it stays there: neither
 * a drag nor Leaflet's `tapHold` (Safari on a phone), which would cancel its click, sees it.
 * A second one reaches the map: a pinch whose second finger lands on it zooms it (#484).
 * The `off` removes the very listener `disableClickPropagation` adds for `touchstart` in
 * Leaflet 1.9.4; e2e/event-map-touch.spec.ts guards it (« the second one on a car's point »),
 * and e2e/event-map-credits.spec.ts on the credits. Gives back what undoes it.
 */
function holdPress(element: HTMLElement): () => void {
  const oneFinger = (event: Event) => {
    if ((event as TouchEvent).touches.length === 1) L.DomEvent.stopPropagation(event);
  };
  L.DomEvent.disableClickPropagation(element);
  L.DomEvent.off(element, "touchstart", L.DomEvent.stopPropagation);
  L.DomEvent.on(element, "touchstart", oneFinger);
  return () => {
    L.DomEvent.off(element, "mousedown dblclick contextmenu", L.DomEvent.stopPropagation);
    L.DomEvent.off(element, "touchstart", oneFinger);
    delete (element as unknown as Record<string, unknown>)._leaflet_disable_click;
  };
}

/** Lucide's « flag », as the design draws it, white on a --primary square; its name is the state's. */
function flagIcon(flag: HTMLSpanElement): L.DivIcon {
  flag.setAttribute("role", "img");
  // On top, it also takes the touch there: a point's button under it does not (CA1.15).
  flag.className = "pointer-events-auto grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground";
  flag.innerHTML =
    '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528"/></svg>';
  // Above every label, whatever the `z-index` Leaflet gives a marker by its latitude.
  return L.divIcon({ html: flag, className: "z-1000!", iconSize: [32, 32] });
}

/** Lucide's « car », as the design draws it in each label. */
const CAR_SVG =
  '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>';

/** Lucide's « armchair », the seat of the free seats' badge, 12 px, #737373 on the label's white (4.74:1). */
const ARMCHAIR_SVG =
  '<svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-muted-foreground"><path d="M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3"/><path d="M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z"/><path d="M5 18v2"/><path d="M19 18v2"/></svg>';

/**
 * The free seats' badge (#655, CA1.21), the label's last part or a bubble button's: a 1 px rule,
 * the seat, `aria-hidden`, then the number, which the name already says. One style for every
 * number, « 0 » included, never amber: the number says it, not a colour. Never cut. Gives the
 * badge and the element whose text is its number.
 */
function seatsBadge(className: string): { badge: HTMLSpanElement; number: HTMLSpanElement } {
  const badge = document.createElement("span");
  badge.dataset.mapSeats = "";
  badge.className = `inline-flex shrink-0 items-center gap-0.5 border-l border-border pl-[5px] font-semibold text-foreground tabular-nums ${className}`;
  badge.innerHTML = ARMCHAIR_SVG;
  const number = document.createElement("span");
  badge.append(number);
  return { badge, number };
}

/** What `drawPoint` draws on: a point's button, the text of its label, and its badge's number. */
type PointElements = { button: HTMLButtonElement; text: HTMLSpanElement; seats: HTMLSpanElement };

/**
 * A point: a real `<button>`, so Enter and Space need no code of ours, 44 × 44 px at least
 * around its label: the driver's first name, cut at 120 px, or the number of its cars, then the
 * badge of its free seats, whole (#655), in a 12 px text. Its name is the whole one. The icon
 * Leaflet places has no size, and the button sits around its point: centred on the car's place,
 * or, at the flag, from the flag's lower edge, its label 24 px under the flag's place, where the
 * flag does not cover it (CA1.15). Without a `z-index` of their own,
 * the labels stack in the DOM's order, the cards' one: the last on top.
 * Made once per point, and drawn again at each state (`drawPoint`): the same element.
 */
function pointButton(onPress: () => void): PointElements {
  const button = document.createElement("button");
  button.type = "button";
  const label = document.createElement("span");
  label.className =
    "flex min-h-7 items-center gap-1 rounded-full border-[1.5px] border-primary bg-background pr-2 pl-1.5 text-xs font-semibold whitespace-nowrap text-foreground shadow-sm group-focus-visible:focus-ring";
  label.innerHTML = CAR_SVG;
  const text = document.createElement("span");
  text.className = "max-w-30 truncate";
  const { badge, number } = seatsBadge("ml-px");
  label.append(text, badge);
  button.append(label);
  // Gone with its marker: nothing to undo.
  holdPress(button);
  button.addEventListener("click", onPress);
  return { button, text, seats: number };
}

/** `point` on its button: its name, its label, its badge, where it sits; a grouped one, whether its bubble is `open`. */
function drawPoint({ button, text, seats }: PointElements, point: CarPoint, open: boolean) {
  button.setAttribute("aria-label", point.name);
  if (point.cars.length > 1) button.setAttribute("aria-expanded", String(open));
  else button.removeAttribute("aria-expanded");
  button.className = [
    "group pointer-events-auto absolute left-0 flex min-h-11 w-max min-w-11 -translate-x-1/2 items-center justify-center focus-visible:outline-hidden",
    point.atFlag ? "top-4" : "top-0 -translate-y-1/2",
  ].join(" ");
  text.textContent = point.label;
  seats.textContent = point.seats;
}

/**
 * A button of the bubble, as the design's outline buttons: 44 px high at least (CA1.8). A car's
 * has its name and, after its text, its car's badge (#655).
 */
function bubbleButton(text: string, car?: { name: string; seats: string }): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  if (car) {
    button.setAttribute("aria-label", car.name);
    const { badge, number } = seatsBadge("ml-1 text-[13px]");
    number.textContent = car.seats;
    button.append(badge);
  }
  button.className =
    "flex min-h-11 w-full items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted focus-visible:focus-ring";
  return button;
}

/** Bubbles opened so far, for each its own title's id: two maps, the aller's and the retour's, may each have one. */
let bubbles = 0;

/**
 * Our bubble (no popup of Leaflet's, whose « Close popup » is English): its title, the point's
 * name, which names it, a button per car in the order of the cards, then « Fermer » (`fill`
 * in `createEventMap`, again at each state while it stays). Focusable itself, so that a press
 * on its title keeps the focus in it.
 */
function bubbleOf(): { bubble: HTMLDivElement; title: HTMLParagraphElement } {
  const bubble = document.createElement("div");
  const title = document.createElement("p");
  title.id = `event-map-bubble-${++bubbles}`;
  title.className = "font-semibold";
  bubble.setAttribute("role", "group");
  // Named by its title, not again by an `aria-label` that a reader would say twice.
  bubble.setAttribute("aria-labelledby", title.id);
  bubble.tabIndex = -1;
  bubble.className =
    "pointer-events-auto absolute z-1001 flex flex-col gap-1.5 overflow-y-auto rounded-xl bg-background p-2.5 text-[13px] text-foreground shadow-[0_6px_20px_rgba(0,0,0,0.25)] outline-hidden";
  // Neither a press nor the wheel in it reaches the map.
  L.DomEvent.disableClickPropagation(bubble);
  L.DomEvent.disableScrollPropagation(bubble);
  return { bubble, title };
}

/**
 * The map of a leg in `container`: our tiles, the flag, the points of `mapOf` as they are, each
 * with its line to the flag (none at the flag), a grouped one with its bubble, the zoom, and
 * our credits last. The view frames them all (`framing`): the flag alone at zoom 14, else every
 * point, 32 px around (half the widest label on the sides when more, #655), the credits' height more at the bottom, zoom 15 at most. The container is a region, focusable (arrows, + and −);
 * the flag is not a button and stays out of the Tab order.
 * Nothing moves by degrees (CA1.10, decision 24 of organizer-view): no zoom, fade or marker
 * animation, no inertia, every framing `{ animate: false }`, and the arrow keys' pans at once
 * (`StillKeyboard`). Neither Shift and a dragged box nor a double click zooms: both end in a
 * `setView` that pans by degrees when the zoom stays. With a mouse, the design has the drag and
 * the buttons alone. The wheel scrolls the page.
 * At touch, one finger scrolls the page too, and two move and zoom the map (CA1.11): dragging
 * follows `touchQuery`, also when it changes, the map staying as it is.
 * Each new state of the page goes through `update` (CA1.7): the points kept stay the same
 * elements, back in the order of the cards; the focus they had comes back; the view is framed
 * again only while nobody has moved or zoomed the map.
 */
export function createEventMap(container: HTMLElement, options: EventMapOptions): EventMapHandle {
  const touch = window.matchMedia(options.touchQuery);
  const map = L.map(container, {
    zoomControl: false,
    attributionControl: false,
    maxZoom: MAX_ZOOM,
    zoomAnimation: false,
    fadeAnimation: false,
    markerZoomAnimation: false,
    inertia: false,
    scrollWheelZoom: false,
    boxZoom: false,
    doubleClickZoom: false,
    // Ours instead, below: `StillKeyboard`.
    keyboard: false,
    dragging: !touch.matches,
    touchZoom: true,
  });
  map.addHandler("keyboard", StillKeyboard);
  map.keyboard.enable();
  const pointerChanged = () => (touch.matches ? map.dragging.disable() : map.dragging.enable());
  touch.addEventListener("change", pointerChanged);

  // Our route answers a tile, or a 502 for everything else: a 502, or the network, is a `tileerror`.
  const tiles = L.tileLayer("/tuiles/{z}/{x}/{y}", { noWrap: true, bounds: WORLD, maxZoom: MAX_ZOOM })
    .on("loading", () => options.onTiles("loading"))
    .on("tileerror", () => options.onTiles("tileerror"))
    .on("load", () => options.onTiles("load"))
    .addTo(map);
  const zoom = L.control.zoom({ zoomInTitle: options.zoomIn, zoomOutTitle: options.zoomOut }).addTo(map);
  for (const button of Array.from(zoom.getContainer()?.querySelectorAll("a") ?? [])) {
    // Inline: Leaflet's style sheet is outside Tailwind's layers, and would win over a class.
    Object.assign(button.style, { width: ZOOM_TARGET, height: ZOOM_TARGET, lineHeight: ZOOM_TARGET });
  }
  // No attribution control (`attributionControl: false`): our credits, there since the loading,
  // after Leaflet's panes and controls, the last of the Tab order (CA3.7). React's only child
  // here: moved within its own parent, among nodes React does not know.
  const { credits } = options;
  container.append(credits);
  const releaseCredits = holdPress(credits);
  /** `h`, measured now: 24 px on one line, 48 on two (at 320 px, or with a larger text). */
  const creditsHeight = () => credits.offsetHeight;

  let state = options.state;
  const flagImage = document.createElement("span");
  const flagAt = (): L.LatLngTuple => [state.flag.lat, state.flag.lng];
  const flag = L.marker(flagAt(), { icon: flagIcon(flagImage), keyboard: false, interactive: false }).addTo(map);
  flagImage.setAttribute("aria-label", state.flagLabel);

  /** Where a point is drawn: at its first car's position, or under the flag. */
  const spot = (point: CarPoint): L.LatLngTuple => (point.atFlag ? flagAt() : [point.position.lat, point.position.lng]);

  /** A point on the map, named by its key (`pointKey`): its marker, its button, its line to the flag (none at the flag). */
  type Drawn = PointElements & { key: string; point: CarPoint; marker: L.Marker; line: L.Polyline | null };
  /** The open bubble, of `entry`'s point: its buttons by car, then « Fermer ». */
  type Open = { entry: Drawn; bubble: HTMLDivElement; title: HTMLParagraphElement; cars: Map<string, HTMLButtonElement>; close: HTMLButtonElement };

  /**
   * The open bubble, in the DOM just after its point (CA1.6): Tab from « Fermer » goes on to the
   * next point. Placed at the map's top right corner, again whenever the map moves.
   */
  let open: Open | null = null;
  // While an update moves or replaces what has the focus: the bubble does not close for it.
  let updating = false;
  const place = () => {
    if (!open) return;
    const size = map.getSize();
    const from = map.latLngToContainerPoint(open.entry.marker.getLatLng());
    const width = Math.min(BUBBLE_WIDTH, size.x - 2 * BUBBLE_INSET);
    Object.assign(open.bubble.style, {
      width: `${width}px`,
      // Never down into the credits' band (CA3.7).
      maxHeight: `${bubbleMaxHeight(size.y, creditsHeight())}px`,
      left: `${size.x - BUBBLE_INSET - width - from.x}px`,
      top: `${BUBBLE_INSET - from.y}px`,
    });
  };
  map.on("move zoom resize", place);
  const closeBubble = () => {
    if (!open) return;
    const { bubble, entry } = open;
    open = null;
    drawPoint(entry, entry.point, false);
    bubble.remove();
  };
  const back = () => {
    const button = open?.entry.button;
    closeBubble();
    button?.focus();
  };
  /** The bubble's title and buttons, for its point as it is now. */
  const fill = (shown: Open) => {
    const { point } = shown.entry;
    shown.title.textContent = point.name;
    shown.cars = new Map(
      point.cars.map((car) => {
        const button = bubbleButton(car.title, car);
        button.addEventListener("click", () => {
          options.onCar(car.id);
          // Its card has the focus now, and the bubble closed with it; otherwise, back to the point.
          if (open === shown) back();
        });
        return [car.id, button];
      }),
    );
    shown.close = bubbleButton(options.close);
    shown.close.addEventListener("click", back);
    shown.bubble.replaceChildren(shown.title, ...shown.cars.values(), shown.close);
  };
  const openBubble = (entry: Drawn) => {
    closeBubble();
    const { bubble, title } = bubbleOf();
    const shown: Open = { entry, bubble, title, cars: new Map(), close: bubbleButton(options.close) };
    fill(shown);
    bubble.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      back();
    });
    // Closed when the focus leaves it, by Tab or elsewhere; not when the window does, the focus
    // staying in the bubble: closed then, it would leave the focus on <body> on the way back.
    bubble.addEventListener("focusout", (event) => {
      if (updating || !document.hasFocus()) return;
      if (!(event.relatedTarget instanceof Node && bubble.contains(event.relatedTarget)) && open === shown) closeBubble();
    });
    open = shown;
    entry.button.after(bubble);
    drawPoint(entry, entry.point, true);
    place();
    shown.cars.values().next().value?.focus();
  };

  /** `entry` showing `point`: the same marker and button, moved, renamed, with or without its line. */
  const redraw = (entry: Drawn, point: CarPoint) => {
    entry.point = point;
    drawPoint(entry, point, open?.entry === entry);
    entry.marker.setLatLng(spot(point));
    if (point.atFlag) {
      entry.line?.remove();
      entry.line = null;
    } else if (entry.line) entry.line.setLatLngs([flagAt(), spot(point)]);
    else entry.line = L.polyline([flagAt(), spot(point)], LINE).addTo(map);
  };
  // Added last: in the marker pane's order, the Tab order (CA1.4), after the points already there.
  const add = (key: string, point: CarPoint): Drawn => {
    const { button, text, seats } = pointButton(() => (entry.point.cars.length > 1 ? openBubble(entry) : options.onCar(entry.point.cars[0].id)));
    const icon = L.divIcon({ html: button, className: "z-auto!", iconSize: [0, 0] });
    const entry: Drawn = { key, point, button, text, seats, line: null, marker: L.marker(spot(point), { icon, keyboard: false, interactive: false }).addTo(map) };
    redraw(entry, point);
    return entry;
  };
  let drawn = state.points.map((point) => add(pointKey(point), point));

  /** What has the focus in the map: a point, a button of the bubble (the bubble itself as its « Fermer »), else the container. */
  const focusNow = (): MapFocus | null => {
    const active = document.activeElement;
    if (!active || !container.contains(active)) return null;
    if (open?.bubble.contains(active)) {
      const car = [...open.cars].find(([, button]) => button === active)?.[0];
      return car === undefined ? { kind: "close" } : { kind: "bubble", car };
    }
    const entry = drawn.find(({ button }) => button === active);
    return entry ? { kind: "point", key: entry.key } : { kind: "container" };
  };
  const focusOn = (target: MapFocus) => {
    const element =
      target.kind === "point"
        ? drawn.find(({ key }) => key === target.key)?.button
        : target.kind === "bubble"
          ? open?.cars.get(target.car)
          : target.kind === "close"
            ? open?.close
            : undefined;
    (element ?? container).focus({ preventScroll: true });
  };

  // Somebody moved or zoomed the map: by a drag, two fingers, the keyboard or the zoom. Our own
  // framings and resizes do not count.
  let touched = false;
  let ours = false;
  const still = (move: () => void) => {
    ours = true;
    try {
      move();
    } finally {
      ours = false;
    }
  };
  map.on("movestart zoomstart", () => {
    if (!ours) touched = true;
  });

  // Framed once the container has a size: folded or in a hidden tab, a map would fit its
  // points into 0 × 0 px, and showing it again only resizes it (CA1.3). Until then, a first
  // map has no view, and Leaflet holds its layers back; a new state's framing waits as well.
  let unframed = true;
  /** Half the widest point's button, its label, as laid out now: 0 for one not in the page yet. */
  const halfLabel = () => Math.max(0, ...drawn.map(({ button }) => button.offsetWidth / 2));
  const fit = () => {
    const view = framing(state.flag, state.points, creditsHeight(), halfLabel());
    still(() => {
      if (view.kind === "flag") map.setView([view.center.lat, view.center.lng], view.zoom, { animate: false });
      else {
        const box: L.LatLngBoundsExpression = [
          [view.south, view.west],
          [view.north, view.east],
        ];
        const { top, right, bottom, left } = view.padding;
        map.fitBounds(box, { paddingTopLeft: [left, top], paddingBottomRight: [right, bottom], maxZoom: view.maxZoom, animate: false });
      }
    });
  };
  const frame = () => {
    if (!unframed || container.clientWidth === 0 || container.clientHeight === 0) return;
    unframed = false;
    const before = halfLabel();
    fit();
    // A first view puts the labels in the page (#655): framed again with their width, in the
    // same task, nothing painted in between.
    if (halfLabel() !== before) fit();
  };
  frame();

  const update = (next: MapState) => {
    const before = focusNow();
    const change = mapUpdate(state, next, { focus: before, bubble: open?.entry.key ?? null, touched });
    updating = true;
    if (change.closeBubble) closeBubble();
    state = next;
    flag.setLatLng(flagAt());
    flagImage.setAttribute("aria-label", next.flagLabel);
    const former = new Map(drawn.map((entry) => [entry.key, entry]));
    for (const key of change.removed) {
      const gone = former.get(key);
      gone?.marker.remove();
      gone?.line?.remove();
    }
    drawn = change.points.map(({ key, change: how }, n) => {
      const entry = how === "created" ? undefined : former.get(key);
      if (!entry) return add(key, next.points[n]);
      redraw(entry, next.points[n]);
      return entry;
    });
    // Still open: the same cars, their names and their order as the cards say now.
    if (open) fill(open);
    if (change.reorder) {
      for (const { marker } of drawn) {
        const icon = marker.getElement();
        icon?.parentElement?.append(icon);
      }
    }
    updating = false;
    place();
    if (change.reframe) {
      unframed = true;
      frame();
    }
    // Given back where a move took it away, or where the table sends it: never <body>.
    const target = change.focus;
    if (target && (!container.contains(document.activeElement) || JSON.stringify(target) !== JSON.stringify(before))) focusOn(target);
  };

  return {
    update,
    resize: () => {
      still(() => map.invalidateSize());
      frame();
    },
    retryTiles: () => tiles.redraw(),
    destroy: () => {
      closeBubble();
      touch.removeEventListener("change", pointerChanged);
      // The credits stay, React's: a map made again in the same container holds them anew.
      releaseCredits();
      map.remove();
    },
  };
}
