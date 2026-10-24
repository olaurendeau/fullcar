/**
 * Leaflet, for a leg's map (epic #238, event-map v15, « Anatomie et accessibilité »). The only
 * file that imports `leaflet` and its style sheet, and it is reached by `import()` alone, at
 * the first opening of a map (CA1.2): until then, the page loads neither.
 * No words here: event-map.tsx gives them, translated.
 */
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { framing } from "@/domain/event-map";
import type { Position } from "@/domain/place";
import type { TilesEvent } from "./event-map-state";

/** A car of a point: its button in a bubble says « Voiture de {prénom} », and is named what its card says. */
export interface PointCar {
  id: string;
  /** « Voiture de {prénom} ». */
  title: string;
  /** « Voiture de {prénom}, départ : {lieu}, {places} ». */
  name: string;
}

/**
 * A point of `mapOf`: where it is, its label and its name; one car, the driver's first name and
 * the car's name; more, their number and « N voitures : {prénoms} », and a bubble (CA1.6).
 */
export interface CarPoint {
  position: Position;
  /** The flag's point: no line, and the label under the flag. */
  atFlag: boolean;
  label: string;
  name: string;
  /** In the order of the cards. */
  cars: PointCar[];
}

export interface EventMapOptions {
  /** The event's place. */
  flag: Position;
  /** The flag's name, « Lieu de l’événement : {location} ». */
  flagLabel: string;
  zoomIn: string;
  zoomOut: string;
  /** « Fermer », the bubble's last button. */
  close: string;
  /** « Source : IGN – Plan IGN v2, {date} », after « Leaflet ». */
  attribution: string;
  /** The media query of a touch screen, the one the two-finger sentence follows (CA1.11). */
  touchQuery: string;
  /** In the order of their first car's card. */
  points: readonly CarPoint[];
  /** A car's point or a bubble's car button activated: to its card. */
  onCar: (id: string) => void;
  /** The tile layer's `loading`, `tileerror` and `load`, view by view (CA2.4): `tilesStep` reads them. */
  onTiles: (event: Exclude<TilesEvent, "retry">) => void;
}

export interface EventMapHandle {
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
/** The bubble, as the design draws it: 10 px from the map's top right corner, 210 px wide at most. */
const BUBBLE_INSET = 10;
const BUBBLE_WIDTH = 210;

/** Leaflet 1.9.4's keyboard handler, `L.Map.Keyboard`, which @types/leaflet does not declare. */
const LeafletKeyboard = (L.Map as unknown as { Keyboard: typeof L.Handler }).Keyboard;
type KeyboardHandler = L.Handler & { _map: L.Map; _onKeyDown(event: KeyboardEvent): void };

/**
 * Leaflet's keyboard, but its arrow keys pan at once (CA1.10, decision 24 of organizer-view).
 * Leaflet 1.9.4 has no option for it: its `_onKeyDown` calls `map.panBy(offset)`, animated for
 * 250 ms. Ours runs that same `_onKeyDown`, so Shift (three times the distance), the `maxBounds`
 * limit and + / − for zoom stay Leaflet's, with `panBy` made still for the time of the key.
 * Its `worldCopyJump` branch calls `panTo`, not `panBy`, and would stay animated: this map
 * does not set `worldCopyJump`.
 * This overrides an internal of Leaflet, and is safe only because package.json pins `leaflet`
 * to exactly 1.9.4: an upgrade reads this again, and e2e/event-map-touch.spec.ts tests the
 * arrows, Shift, + and −.
 */
const StillKeyboard = LeafletKeyboard.extend({
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

/** Leaflet writes the attribution as HTML: ours is text, and stays text. */
function asText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Lucide's « flag », as the design draws it, white on a black square. */
function flagIcon(label: string): L.DivIcon {
  const flag = document.createElement("span");
  flag.setAttribute("role", "img");
  flag.setAttribute("aria-label", label);
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

/**
 * A point: a real `<button>`, so Enter and Space need no code of ours, 44 × 44 px at least
 * around its label: the driver's first name, cut at 120 px, or the number of its cars, in a
 * 12 px text. Its name is the whole one. The icon Leaflet places has no size, and the button sits around its point:
 * centred on the car's place, or, at the flag, from the flag's lower edge, its label 24 px under
 * the flag's place, where the flag does not cover it (CA1.15). Without a `z-index` of their own,
 * the labels stack in the DOM's order, the cards' one: the last on top.
 */
function pointIcon(point: CarPoint, onPress: (button: HTMLButtonElement) => void): L.DivIcon {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", point.name);
  if (point.cars.length > 1) button.setAttribute("aria-expanded", "false");
  button.className = [
    "group pointer-events-auto absolute left-0 flex min-h-11 w-max min-w-11 -translate-x-1/2 items-center justify-center focus-visible:outline-hidden",
    point.atFlag ? "top-4" : "top-0 -translate-y-1/2",
  ].join(" ");
  const label = document.createElement("span");
  label.className =
    "flex min-h-7 items-center gap-1 rounded-full border-[1.5px] border-primary bg-background pr-2 pl-1.5 text-xs font-semibold whitespace-nowrap text-foreground shadow-sm group-focus-visible:focus-ring";
  label.innerHTML = CAR_SVG;
  const text = document.createElement("span");
  text.className = "max-w-30 truncate";
  text.textContent = point.label;
  label.append(text);
  button.append(label);
  // A press on a point neither drags nor zooms the map. A finger on it still reaches the map:
  // a pinch whose second finger lands on a point zooms it (#484).
  L.DomEvent.disableClickPropagation(button);
  L.DomEvent.off(button, "touchstart", L.DomEvent.stopPropagation);
  button.addEventListener("click", () => onPress(button));
  return L.divIcon({ html: button, className: "z-auto!", iconSize: [0, 0] });
}

/** A button of the bubble, as the design's outline buttons: 44 px high at least (CA1.8). */
function bubbleButton(text: string, name?: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  if (name) button.setAttribute("aria-label", name);
  button.className =
    "flex min-h-11 w-full items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted focus-visible:focus-ring";
  return button;
}

/** Bubbles opened so far, for each its own title's id: two maps, the aller's and the retour's, may each have one. */
let bubbles = 0;

/**
 * Our bubble (no popup of Leaflet's, whose « Close popup » is English): its title, the point's
 * name, which names it, a button per car in the order of the cards, then « Fermer ». Focusable
 * itself, so that a press on its title keeps the focus in it.
 */
function bubbleOf(point: CarPoint, close: string): { bubble: HTMLDivElement; cars: HTMLButtonElement[]; close: HTMLButtonElement } {
  const bubble = document.createElement("div");
  const title = document.createElement("p");
  title.id = `event-map-bubble-${++bubbles}`;
  title.className = "font-semibold";
  title.textContent = point.name;
  bubble.setAttribute("role", "group");
  // Named by its title, not again by an `aria-label` that a reader would say twice.
  bubble.setAttribute("aria-labelledby", title.id);
  bubble.tabIndex = -1;
  bubble.className =
    "pointer-events-auto absolute z-1001 flex flex-col gap-1.5 overflow-y-auto rounded-xl bg-background p-2.5 text-[13px] text-foreground shadow-[0_6px_20px_rgba(0,0,0,0.25)] outline-hidden";
  const cars = point.cars.map((car) => bubbleButton(car.title, car.name));
  const last = bubbleButton(close);
  bubble.append(title, ...cars, last);
  // Neither a press nor the wheel in it reaches the map.
  L.DomEvent.disableClickPropagation(bubble);
  L.DomEvent.disableScrollPropagation(bubble);
  return { bubble, cars, close: last };
}

/**
 * The map of a leg in `container`: our tiles, the flag, the points of `mapOf` as they are, each
 * with its line to the flag (none at the flag), a grouped one with its bubble, the zoom and
 * the attribution. The view frames them all (`framing`):
 * the flag alone at zoom 14, else every point, 32 px around, zoom 15 at most. The container is a region, focusable (arrows, + and −);
 * the flag is not a button and stays out of the Tab order.
 * Nothing moves by degrees (CA1.10, decision 24 of organizer-view): no zoom, fade or marker
 * animation, no inertia, every framing `{ animate: false }`, and the arrow keys' pans at once
 * (`StillKeyboard`). Neither Shift and a dragged box nor a double click zooms: both end in a
 * `setView` that pans by degrees when the zoom stays. With a mouse, the design has the drag and
 * the buttons alone. The wheel scrolls the page.
 * At touch, one finger scrolls the page too, and two move and zoom the map (CA1.11): dragging
 * follows `touchQuery`, also when it changes, the map staying as it is.
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

  // Our route answers a missing tile with a blank one: only a failure (502, the network) is a `tileerror`.
  const tiles = L.tileLayer("/tuiles/{z}/{x}/{y}", { noWrap: true, bounds: WORLD, maxZoom: MAX_ZOOM })
    .on("loading", () => options.onTiles("loading"))
    .on("tileerror", () => options.onTiles("tileerror"))
    .on("load", () => options.onTiles("load"))
    .addTo(map);
  L.control.attribution({ prefix: "Leaflet" }).addAttribution(asText(options.attribution)).addTo(map);
  const zoom = L.control.zoom({ zoomInTitle: options.zoomIn, zoomOutTitle: options.zoomOut }).addTo(map);
  for (const button of Array.from(zoom.getContainer()?.querySelectorAll("a") ?? [])) {
    // Inline: Leaflet's style sheet is outside Tailwind's layers, and would win over a class.
    Object.assign(button.style, { width: ZOOM_TARGET, height: ZOOM_TARGET, lineHeight: ZOOM_TARGET });
  }

  const flag: L.LatLngTuple = [options.flag.lat, options.flag.lng];
  L.marker(flag, { icon: flagIcon(options.flagLabel), keyboard: false, interactive: false }).addTo(map);

  /**
   * The open bubble, in the DOM just after its point (CA1.6): Tab from « Fermer » goes on to the
   * next point. Placed at the map's top right corner, again whenever the map moves.
   */
  let open: { bubble: HTMLDivElement; button: HTMLButtonElement; at: L.LatLng } | null = null;
  const place = () => {
    if (!open) return;
    const size = map.getSize();
    const from = map.latLngToContainerPoint(open.at);
    const width = Math.min(BUBBLE_WIDTH, size.x - 2 * BUBBLE_INSET);
    Object.assign(open.bubble.style, {
      width: `${width}px`,
      maxHeight: `${size.y - 2 * BUBBLE_INSET}px`,
      left: `${size.x - BUBBLE_INSET - width - from.x}px`,
      top: `${BUBBLE_INSET - from.y}px`,
    });
  };
  map.on("move zoom resize", place);
  const closeBubble = () => {
    if (!open) return;
    const { bubble, button } = open;
    open = null;
    button.setAttribute("aria-expanded", "false");
    bubble.remove();
  };
  const openBubble = (point: CarPoint, button: HTMLButtonElement, at: L.LatLng) => {
    closeBubble();
    const { bubble, cars, close } = bubbleOf(point, options.close);
    const back = () => {
      closeBubble();
      button.focus();
    };
    point.cars.forEach((car, n) =>
      cars[n].addEventListener("click", () => {
        options.onCar(car.id);
        // Its card has the focus now, and the bubble closed with it; otherwise, back to the point.
        if (open?.bubble === bubble) back();
      }),
    );
    close.addEventListener("click", back);
    bubble.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      back();
    });
    // Closed when the focus leaves it, by Tab or elsewhere; not when the window does, the focus
    // staying in the bubble: closed then, it would leave the focus on <body> on the way back.
    bubble.addEventListener("focusout", (event) => {
      if (!document.hasFocus()) return;
      if (!(event.relatedTarget instanceof Node && bubble.contains(event.relatedTarget)) && open?.bubble === bubble) closeBubble();
    });
    open = { bubble, button, at };
    button.after(bubble);
    button.setAttribute("aria-expanded", "true");
    place();
    cars[0].focus();
  };

  // Added in the order of their first car's card: the marker pane's order, and so the Tab order (CA1.4).
  for (const point of options.points) {
    const at: L.LatLngTuple = point.atFlag ? flag : [point.position.lat, point.position.lng];
    if (!point.atFlag) L.polyline([flag, at], LINE).addTo(map);
    const press = (button: HTMLButtonElement) =>
      point.cars.length > 1 ? openBubble(point, button, L.latLng(at)) : options.onCar(point.cars[0].id);
    L.marker(at, { icon: pointIcon(point, press), keyboard: false, interactive: false }).addTo(map);
  }

  // Framed once the container has a size: created again while folded or in a hidden tab, a map
  // would fit its points into 0 × 0 px, and showing it again only resizes it (CA1.3). Until
  // then it has no view, and Leaflet holds its layers back.
  let framed = false;
  const frame = () => {
    if (framed || container.clientWidth === 0 || container.clientHeight === 0) return;
    framed = true;
    const view = framing(options.flag, options.points);
    if (view.kind === "flag") map.setView([view.center.lat, view.center.lng], view.zoom, { animate: false });
    else {
      const box: L.LatLngBoundsExpression = [
        [view.south, view.west],
        [view.north, view.east],
      ];
      map.fitBounds(box, { padding: [view.padding, view.padding], maxZoom: view.maxZoom, animate: false });
    }
  };
  frame();

  return {
    resize: () => {
      map.invalidateSize();
      frame();
    },
    retryTiles: () => tiles.redraw(),
    destroy: () => {
      closeBubble();
      touch.removeEventListener("change", pointerChanged);
      map.remove();
    },
  };
}
