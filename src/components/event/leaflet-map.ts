/**
 * Leaflet, for a leg's map (epic #238, event-map v11, « Anatomie et accessibilité »). The only
 * file that imports `leaflet` and its style sheet, and it is reached by `import()` alone, at
 * the first opening of a map (CA1.2): until then, the page loads neither.
 * No words here: event-map.tsx gives them, translated.
 */
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { framing } from "@/domain/event-map";
import type { Position } from "@/domain/place";

export interface EventMapOptions {
  /** The event's place. */
  flag: Position;
  /** The flag's name, « Lieu de l’événement : {location} ». */
  flagLabel: string;
  zoomIn: string;
  zoomOut: string;
  /** « Source : IGN – Plan IGN v2, {date} », after « Leaflet ». */
  attribution: string;
  /** The media query of a touch screen, the one the two-finger sentence follows (CA1.11). */
  touchQuery: string;
}

export interface EventMapHandle {
  /** To call when the container's size changes, as when its panel is shown again. */
  resize(): void;
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

/** Leaflet 1.9.4's keyboard handler, `L.Map.Keyboard`, which @types/leaflet does not declare. */
const LeafletKeyboard = (L.Map as unknown as { Keyboard: typeof L.Handler }).Keyboard;
type KeyboardHandler = L.Handler & { _map: L.Map; _onKeyDown(event: KeyboardEvent): void };

/**
 * Leaflet's keyboard, but its arrow keys pan at once (CA1.10, decision 24 of organizer-view).
 * Leaflet 1.9.4 has no option for it: its `_onKeyDown` calls `map.panBy(offset)`, animated for
 * 250 ms. Ours runs that same `_onKeyDown`, so Shift (three times the distance), the `maxBounds`
 * limit and + / − for zoom stay Leaflet's, with `panBy` made still for the time of the key.
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
      map.panBy = panBy;
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
  flag.className = "grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground";
  flag.innerHTML =
    '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528"/></svg>';
  return L.divIcon({ html: flag, className: "", iconSize: [32, 32] });
}

/**
 * The map of a leg in `container`: our tiles, the flag, the zoom and the attribution. The flag
 * alone is framed at zoom 14 (`framing`). The container is a region, focusable (arrows, + and −);
 * the flag is not a button and stays out of the Tab order.
 * Nothing moves by degrees (CA1.10, decision 24 of organizer-view): no zoom, fade or marker
 * animation, no inertia, every framing `{ animate: false }`, and the arrow keys' pans at once
 * (`StillKeyboard`). The wheel scrolls the page.
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
    // Ours instead, below: `StillKeyboard`.
    keyboard: false,
    dragging: !touch.matches,
    touchZoom: true,
  });
  map.addHandler("keyboard", StillKeyboard);
  map.keyboard.enable();
  const pointerChanged = () => (touch.matches ? map.dragging.disable() : map.dragging.enable());
  touch.addEventListener("change", pointerChanged);

  L.tileLayer("/tuiles/{z}/{x}/{y}", { noWrap: true, bounds: WORLD, maxZoom: MAX_ZOOM }).addTo(map);
  L.control.attribution({ prefix: "Leaflet" }).addAttribution(asText(options.attribution)).addTo(map);
  const zoom = L.control.zoom({ zoomInTitle: options.zoomIn, zoomOutTitle: options.zoomOut }).addTo(map);
  for (const button of Array.from(zoom.getContainer()?.querySelectorAll("a") ?? [])) {
    // Inline: Leaflet's style sheet is outside Tailwind's layers, and would win over a class.
    Object.assign(button.style, { width: ZOOM_TARGET, height: ZOOM_TARGET, lineHeight: ZOOM_TARGET });
  }

  L.marker([options.flag.lat, options.flag.lng], { icon: flagIcon(options.flagLabel), keyboard: false, interactive: false }).addTo(map);

  const view = framing(options.flag, []);
  if (view.kind === "flag") map.setView([view.center.lat, view.center.lng], view.zoom, { animate: false });

  return {
    resize: () => map.invalidateSize(),
    destroy: () => {
      touch.removeEventListener("change", pointerChanged);
      map.remove();
    },
  };
}
