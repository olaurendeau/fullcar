/**
 * The Stops of a car on the aller (epic #881, RV1.4 and RV1.5): what the form sends, read
 * as a list, and the rules of each line. Pure functions: the caller reads the departure
 * under the Ride's lock, then writes what they decide.
 */
import { isCreationId } from "./creation-id";
import { positionOf, type Position } from "./place";
import { RIDE_LOCATION_MAX } from "./ride";
import { text } from "./text";
import { isWallTime, type WallTime } from "./wall-clock";

/** A car has six Stops at most, the database refuses a seventh (`rank` from 0 to 5). */
export const STOPS_MAX = 6;

/** A Stop as read from the request, before its rules: the texts are as typed. */
export interface SentStop {
  id: string;
  location: string;
  /** The point of the suggestion chosen for `location`; `null` for a place typed by hand. */
  position: Position | null;
  /** As an `<input type="time">` sends it, empty when not filled. */
  time: string;
}

/** A Stop that follows the rules: the place trimmed, the time `HH:MM`. */
export interface ValidStop {
  id: string;
  location: string;
  position: Position | null;
  time: WallTime;
}

export type StopLocationError = "required" | "tooLong";
export type StopTimeError = "badTime" | "notAfterDeparture";

/** The errors of one line; empty for a line that is right. */
export interface StopLineErrors {
  location?: StopLocationError;
  time?: StopTimeError;
}

export type StopsValidation =
  | { ok: true; stops: ValidStop[] }
  /** One entry per line sent, and the index of the first line in error. */
  | { ok: false; errors: StopLineErrors[]; first: number };

function sentStop(item: unknown): SentStop | undefined {
  if (typeof item !== "object" || item === null) return undefined;
  const { id, location, position, time } = item as Record<string, unknown>;
  if (!isCreationId(id) || typeof location !== "string" || typeof time !== "string") return undefined;
  // Postgres refuses it in a `text`: only a forged request can send it.
  if (location.includes("\u0000")) return undefined;
  const read = position === undefined ? { value: null } : positionOf(position);
  return "value" in read ? { id, location, position: read.value, time } : undefined;
}

/**
 * The list a request sends, a position left out being none: at most `STOPS_MAX` items, each
 * with a creation id, a place and a time as text, and a position that `positionOf` reads;
 * no id twice. Anything else comes from a forged request: `invalid`.
 */
export function stopsOf(input: unknown): { value: SentStop[] } | { error: "invalid" } {
  if (!Array.isArray(input) || input.length > STOPS_MAX) return { error: "invalid" };
  const stops: (SentStop | undefined)[] = input.map(sentStop);
  const read = stops.filter((stop) => stop !== undefined);
  if (read.length !== stops.length) return { error: "invalid" };
  if (new Set(read.map((stop) => stop.id)).size !== read.length) return { error: "invalid" };
  return { value: read };
}

function lineErrors(stop: SentStop, departureTime: WallTime | undefined): StopLineErrors {
  const errors: StopLineErrors = {};
  const place = text(stop.location, RIDE_LOCATION_MAX);
  if ("error" in place) errors.location = place.error === "tooLong" ? "tooLong" : "required";
  if (!isWallTime(stop.time)) errors.time = "badTime";
  // `HH:MM` strings compare in the order of the clock.
  else if (departureTime !== undefined && stop.time <= departureTime) errors.time = "notAfterDeparture";
  return errors;
}

/**
 * RV1.4: each Stop has a place (120 characters at most, as the departure's) and a valid
 * time, strictly after `departureTime` when it is known. RV1.5: the Stops come back by time,
 * and at the same time in the order they were sent (a stable sort).
 */
export function validateStops(stops: readonly SentStop[], departureTime: WallTime | undefined): StopsValidation {
  const errors = stops.map((stop) => lineErrors(stop, departureTime));
  const first = errors.findIndex((line) => line.location !== undefined || line.time !== undefined);
  if (first !== -1) return { ok: false, errors, first };
  const valid = stops.map(({ id, location, position, time }) => ({ id, location: location.trim(), position, time }));
  return { ok: true, stops: valid.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0)) };
}
