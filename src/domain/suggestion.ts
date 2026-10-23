/**
 * The suggestions of a place (place-autocomplete): what `POST /api/lieux` accepts, what it
 * asks Photon, and the labels it makes of Photon's answer. Pure: the call itself, its cache
 * and its breaker live beside the route.
 */
import { isLocale, type Locale } from "@/i18n/locales";
import { nearOf, positionOf, type Position } from "./place";
import { text } from "./text";

/** What the route asks for: the text trimmed, the page's language, the event's area or `null`. */
export interface PlaceQuery {
  text: string;
  locale: Locale;
  /** Already rounded to 1 decimal (`nearOf`): the event's exact position never leaves. */
  near: Position | null;
}

/** A suggestion, as the route answers it. */
export interface Suggestion {
  label: string;
  lat: number;
  lng: number;
}

/** In code points, after trim: shorter or longer, the route answers `invalid` without a call. */
const MIN_TEXT = 3;
const MAX_TEXT = 120;

/** A longer label is not shown (AL1.4). */
const MAX_LABEL = 120;

/** As many as Photon is asked for. */
const LIMIT = 5;

/** The body of `POST /api/lieux`, `{ text, locale, near? }`, or `invalid`. */
export function placeQueryOf(body: unknown): { value: PlaceQuery } | { error: "invalid" } {
  // Not an object, a body has no fields: invalid below.
  const fields = (body ?? {}) as Record<string, unknown>;
  const read = text(fields.text, MAX_TEXT);
  // A lone surrogate: `encodeURIComponent` would throw on it in `photonQuery`.
  if ("error" in read || [...read.value].length < MIN_TEXT || !read.value.isWellFormed()) return { error: "invalid" };
  if (!isLocale(fields.locale)) return { error: "invalid" };
  const near = positionOf(fields.near ?? null);
  if ("error" in near) return { error: "invalid" };
  return { value: { text: read.value, locale: fields.locale, near: near.value && nearOf(near.value) } };
}

/**
 * The URL of the search at Photon's `base`: `q`, `limit=5`, `lang`, and the area as `lat` and
 * `lon` when there is one. Each value goes through `encodeURIComponent`.
 */
export function photonQuery(base: string, query: PlaceQuery): string {
  const params: [string, string | number][] = [
    ["q", query.text],
    ["limit", LIMIT],
    ["lang", query.locale],
  ];
  if (query.near) params.push(["lat", query.near.lat], ["lon", query.near.lng]);
  return `${base}?${params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&")}`;
}

/** The key of an answer in the cache: the text in lower case, its spaces reduced, the language, the area. */
export function cacheKey(query: PlaceQuery): string {
  const normalized = query.text.toLowerCase().replace(/\s+/gu, " ");
  return JSON.stringify([normalized, query.locale, query.near && [query.near.lat, query.near.lng]]);
}

/** A property of a feature as text, trimmed; absent, empty or not text, `undefined`. */
function property(properties: Record<string, unknown>, key: string): string | undefined {
  const value = properties[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function joined(parts: (string | undefined)[], separator: string): string | undefined {
  const present = parts.filter((part) => part !== undefined);
  return present.length > 0 ? present.join(separator) : undefined;
}

/** France by its code, or by its name when Photon gives no code (« France » in French and in English). */
function inFrance(properties: Record<string, unknown>): boolean {
  const code = property(properties, "countrycode");
  return code === undefined ? property(properties, "country") === "France" : code.toUpperCase() === "FR";
}

/**
 * The label of a feature, as the page writes it: a city « {city} ({postcode}) », or without a
 * postcode « {city}, {county or state} »; a street « {street}, {postcode} {city} »; a named
 * place « {name}, {postcode} {city} »; an address « {housenumber} {street}, {postcode} {city} ».
 * Outside France, « , {country} » at the end, as Photon gives it: asked with `lang`, Photon
 * names it in the page's language. Nothing to name it by: no label.
 */
function labelOf(properties: Record<string, unknown>): string | undefined {
  const name = property(properties, "name");
  const street = property(properties, "street");
  const housenumber = property(properties, "housenumber");
  const postcode = property(properties, "postcode");
  const area = joined([postcode, property(properties, "city")], " ");
  const type = property(properties, "type");

  let label: string | undefined;
  if (type === "city") {
    label = name && (postcode ? `${name} (${postcode})` : joined([name, property(properties, "county") ?? property(properties, "state")], ", "));
  } else if (type === "street") {
    label = (name ?? street) && joined([name ?? street, area], ", ");
  } else if (name) {
    label = joined([name, area], ", ");
  } else if (housenumber && street) {
    label = joined([`${housenumber} ${street}`, area], ", ");
  }
  if (label === undefined) return undefined;

  const country = property(properties, "country");
  return inFrance(properties) || country === undefined || country === label ? label : `${label}, ${country}`;
}

function suggestionOf(feature: unknown): Suggestion | undefined {
  if (typeof feature !== "object" || feature === null) return undefined;
  const { geometry, properties } = feature as Record<string, unknown>;
  if (typeof properties !== "object" || properties === null) return undefined;
  const coordinates = typeof geometry === "object" && geometry !== null ? (geometry as Record<string, unknown>).coordinates : undefined;
  if (!Array.isArray(coordinates)) return undefined;
  // GeoJSON: [lon, lat]. A missing one is not a number: invalid.
  const position = positionOf({ lat: coordinates[1], lng: coordinates[0] });
  if ("error" in position || position.value === null) return undefined;
  const label = labelOf(properties as Record<string, unknown>);
  if (label === undefined || [...label].length > MAX_LABEL) return undefined;
  return { label, ...position.value };
}

/**
 * The suggestions of Photon's answer (GeoJSON), in its order: those it cannot name or place,
 * and labels longer than 120 characters, left out; two identical labels, the first; 5 at most.
 * An answer without a list of features is unreadable: `null`, not « no suggestion ».
 */
export function suggestionsOf(json: unknown): Suggestion[] | null {
  const features = typeof json === "object" && json !== null ? (json as Record<string, unknown>).features : undefined;
  if (!Array.isArray(features)) return null;
  const suggestions: Suggestion[] = [];
  for (const feature of features) {
    const suggestion = suggestionOf(feature);
    if (suggestion && !suggestions.some((kept) => kept.label === suggestion.label)) suggestions.push(suggestion);
    if (suggestions.length === LIMIT) break;
  }
  return suggestions;
}
