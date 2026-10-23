/**
 * A place is one value, `{ text, position }` (place-autocomplete, « Un lieu, une valeur »):
 * wherever the code compares, sends, copies or checks a place, it is this pair, never the
 * text alone. The position is the point of the suggestion chosen, or `null`.
 */

export interface Position {
  lat: number;
  lng: number;
}

export interface Place {
  text: string;
  position: Position | null;
}

/** About a metre: a presentation, not a blur (D5). */
const DECIMALS = 5;

/** About 10 km: the event's position, as Photon receives it to bring suggestions closer. */
const NEAR_DECIMALS = 1;

/** Rounded to the nearest; `+ 0` makes a rounded −0 a 0. */
function rounded(value: number, decimals: number): number {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale + 0;
}

/** In [−bound, bound], which also refuses `NaN` and the infinities. */
function within(value: unknown, bound: number): value is number {
  return typeof value === "number" && value >= -bound && value <= bound;
}

/**
 * The position a request sends: `null` stays `null`; `{ lat, lng }` of two finite numbers,
 * the latitude in [−90, 90] and the longitude in [−180, 180], becomes that position rounded
 * to 5 decimals. Anything else comes from a forged request: invalid, not an exception.
 * `undefined` is not a value: each caller reads it as « not sent » before calling this.
 */
export function positionOf(value: unknown): { value: Position | null } | { error: "invalid" } {
  if (value === null) return { value: null };
  if (typeof value !== "object") return { error: "invalid" };
  // Exactly two own enumerable keys, lat and lng: never one read from the prototype, nor a hidden one.
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes("lat") || !keys.includes("lng")) return { error: "invalid" };
  const { lat, lng } = value as Record<string, unknown>;
  if (!within(lat, 90) || !within(lng, 180)) return { error: "invalid" };
  return { value: { lat: rounded(lat, DECIMALS), lng: rounded(lng, DECIMALS) } };
}

/** Both `null`, or the same coordinates at 5 decimals. */
export function samePosition(a: Position | null, b: Position | null): boolean {
  if (a === null || b === null) return a === b;
  return rounded(a.lat, DECIMALS) === rounded(b.lat, DECIMALS) && rounded(a.lng, DECIMALS) === rounded(b.lng, DECIMALS);
}

/**
 * The only comparison of a place, on the server as in the forms: the same text and the same
 * position. The same text with another position is a change.
 */
export function samePlace(a: Place, b: Place): boolean {
  return a.text === b.text && samePosition(a.position, b.position);
}

/** The bias sent to Photon: the position rounded to 1 decimal, never the exact point. */
export function nearOf(position: Position): Position {
  return { lat: rounded(position.lat, NEAR_DECIMALS), lng: rounded(position.lng, NEAR_DECIMALS) };
}
