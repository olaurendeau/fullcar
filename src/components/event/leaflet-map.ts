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
 */
export function createEventMap(container: HTMLElement, options: EventMapOptions): EventMapHandle {
  const map = L.map(container, { zoomControl: false, attributionControl: false, maxZoom: MAX_ZOOM });

  L.tileLayer("/tuiles/{z}/{x}/{y}", { noWrap: true, bounds: WORLD, maxZoom: MAX_ZOOM }).addTo(map);
  L.control.attribution({ prefix: "Leaflet" }).addAttribution(asText(options.attribution)).addTo(map);
  const zoom = L.control.zoom({ zoomInTitle: options.zoomIn, zoomOutTitle: options.zoomOut }).addTo(map);
  for (const button of Array.from(zoom.getContainer()?.querySelectorAll("a") ?? [])) {
    // Inline: Leaflet's style sheet is outside Tailwind's layers, and would win over a class.
    Object.assign(button.style, { width: ZOOM_TARGET, height: ZOOM_TARGET, lineHeight: ZOOM_TARGET });
  }

  L.marker([options.flag.lat, options.flag.lng], { icon: flagIcon(options.flagLabel), keyboard: false, interactive: false }).addTo(map);

  const view = framing(options.flag, []);
  if (view.kind === "flag") map.setView([view.center.lat, view.center.lng], view.zoom);

  return {
    resize: () => map.invalidateSize(),
    destroy: () => map.remove(),
  };
}
