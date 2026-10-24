/**
 * A tile of the Web Mercator grid that Leaflet and Geoapify share, as our route
 * `/tuiles/{z}/{x}/{y}` reads it (event-map v27, « Les tuiles »; #549).
 * Pure functions: no fetch.
 */

export interface Tile {
  z: number;
  x: number;
  y: number;
}

/** The last zoom of the map: the route asks for nothing past it. */
const MAX_ZOOM = 18;

/** Canonical decimal only: no sign, no leading zero, so that one tile has one URL in the CDN's cache. */
const CANONICAL = /^(0|[1-9]\d*)$/;

function integerOf(value: string): number | null {
  return CANONICAL.test(value) ? Number(value) : null;
}

/**
 * The tile the route's three segments name: `z` from 0 to 18, `x` and `y` from 0 to 2^z − 1,
 * each in canonical decimal. Anything else is `null`, which the route answers 404 without
 * calling Geoapify.
 */
export function tileOf(params: { z: string; x: string; y: string }): Tile | null {
  const z = integerOf(params.z);
  const x = integerOf(params.x);
  const y = integerOf(params.y);
  if (z === null || x === null || y === null || z > MAX_ZOOM) return null;
  const size = 2 ** z;
  if (x >= size || y >= size) return null;
  return { z, x, y };
}
