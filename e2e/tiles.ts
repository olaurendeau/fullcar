/**
 * The slot's fake tile provider (e2e/fake-tiles.mjs), set from a test through its control
 * port, and the tiles of a test. It is set by tile, `z/x/y` as Leaflet and `/tuiles/{z}/{x}/{y}`
 * name it, never for all tiles: the tests run in parallel. It keeps what it is told and what
 * it receives for as long as it runs, so each test takes its tiles around `placeOf` its own
 * seeded event.
 */
import type { Position } from "@/domain/place";

/**
 * What the fake answers to a tile: by default (`tile`) a grey PNG of 512 × 512; `unauthorized`
 * (401), `forbidden` (403), `notFound` (404), `tooMany` (429, with `retryAfter` sent as is in
 * `Retry-After` when given), `error` (500), `notPng` (a 200 `text/html`). `delayMs` delays it,
 * whatever it is, 2³¹ − 1 ms at most: Node would cut a longer timer to 1 ms.
 */
export type TileAnswer = {
  kind?: "tile" | "unauthorized" | "forbidden" | "notFound" | "tooMany" | "error" | "notPng";
  retryAfter?: string;
  delayMs?: number;
};

/** A request the fake received: its path, its query as sent, and its headers (lower case). */
export type TileRequest = { path: string; query: string; headers: Record<string, string | undefined> };

function controlUrl(path: string) {
  const base = process.env.TILES_CONTROL_URL;
  if (!base) throw new Error("e2e: TILES_CONTROL_URL is not set");
  return new URL(path, base);
}

/** From now on, the fake answers `answer` to each of `tiles` (`z/x/y`), and to them only. */
export async function answerTiles(tiles: string[], answer: TileAnswer): Promise<void> {
  const response = await fetch(controlUrl("/answers"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tiles, answer }),
  });
  if (response.status !== 204) throw new Error(`e2e: the fake tile provider refused the answer (${response.status})`);
}

/** The requests the fake received for the tile `tile` (`z/x/y`), oldest first. */
export async function requestsForTile(tile: string): Promise<TileRequest[]> {
  const url = controlUrl("/requests");
  url.searchParams.set("tile", tile);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`e2e: the fake tile provider did not list its requests (${response.status})`);
  return response.json();
}

// Leaflet 1.9.4's grid: EPSG:3857 (L.Projection.SphericalMercator and the transformation of
// L.CRS.EPSG3857), 256 px tiles, a tile being the pixel divided by 256, rounded down.
const EARTH_RADIUS = 6378137;
const MAX_LATITUDE = 85.0511287798;
const TILE_SIZE = 256;

/** The tile, `z/x/y`, that holds `position` at zoom `z`, as Leaflet asks for it. */
export function tileAt(position: Position, z: number): string {
  const d = Math.PI / 180;
  const lat = Math.max(Math.min(MAX_LATITUDE, position.lat), -MAX_LATITUDE);
  const sin = Math.sin(lat * d);
  const projected = { x: EARTH_RADIUS * position.lng * d, y: (EARTH_RADIUS * Math.log((1 + sin) / (1 - sin))) / 2 };
  const scale = 0.5 / (Math.PI * EARTH_RADIUS);
  const size = TILE_SIZE * 2 ** z;
  const last = 2 ** z - 1;
  // The grid's edges (180° east, the poles) stay in the grid, as Leaflet's `noWrap` bounds do.
  const cell = (pixel: number) => Math.min(Math.max(Math.floor(pixel / TILE_SIZE), 0), last);
  return `${z}/${cell((scale * projected.x + 0.5) * size)}/${cell((-scale * projected.y + 0.5) * size)}`;
}

// A rectangle of mainland France, inland from its coasts and borders: from near Pau to near
// Caen, and from near Verdun to near Aix-en-Provence.
const FRANCE = { south: 43.6, north: 49, west: -0.5, east: 5.5 };

/**
 * FNV-1a, 32 bits, then murmur3's finaliser (`fmix32`): plain arithmetic, the same number for
 * the same text on every run. FNV-1a alone mixes its last bytes poorly: `id:lat` and `id:lng`
 * would differ by one of a few dozen values, and the places would lie on as many lines.
 */
function hashOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/**
 * A position in France drawn from the seeded event's id: two events, two zones, so that the
 * tiles one test sets are not those another test looks at. Neither random nor a crypto hash.
 */
export function placeOf(eventId: string): Position {
  const fraction = (salt: string) => hashOf(`${eventId}:${salt}`) / 2 ** 32;
  return {
    lat: FRANCE.south + fraction("lat") * (FRANCE.north - FRANCE.south),
    lng: FRANCE.west + fraction("lng") * (FRANCE.east - FRANCE.west),
  };
}

/**
 * This test's own tile, `z/x/y` at z 18, and `dx` columns further east: the fake keeps its
 * answers and requests for its whole life. At z 18, 256 times the tiles of z 14: a test needs
 * no map view, only tiles of its own.
 */
export function tileOf(eventId: string, dx = 0): string {
  const [z, x, y] = tileAt(placeOf(eventId), 18).split("/").map(Number);
  return `${z}/${x + dx}/${y}`;
}

/** The eight bytes every PNG starts with. */
export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
