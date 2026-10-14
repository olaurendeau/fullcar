/**
 * The rules of a Ride (epic #66): the form "Proposer une voiture" (R4), reducing the
 * seats (R8, C8.4 and C8.5), and the all-or-nothing decision of taking seats (C5.7, C5.8,
 * C6.5). Pure functions: the caller reads the Ride under its lock, then writes what they
 * decide.
 */
import { optionalText, text, type TextError } from "./text";
import { isWallTime, type WallTime } from "./wall-clock";

export const RIDE_LOCATION_MAX = 120;
export const RIDE_NOTE_MAX = 200;
/** Passenger seats, driver not included. */
export const RIDE_SEATS_MIN = 1;
export const RIDE_SEATS_MAX = 8;
/** What the form offers before the driver changes it. */
export const RIDE_SEATS_DEFAULT = 3;

/** An optional minus sign and digits: anything else is not a whole number. */
const WHOLE_NUMBER = /^-?[0-9]+$/;

/** The fields that can carry an error, in the order of the form: the first one gets the focus. */
export const RIDE_FIELDS = ["location", "time", "seats", "note"] as const;
export type RideField = (typeof RIDE_FIELDS)[number];

/** Error codes, translated by the view. */
export type RideError = TextError | "outOfRange";
export type RideErrors = Partial<Record<RideField, RideError>>;

/** What the form sends. A missing text counts as empty. */
export interface RideFields {
  location?: string;
  /** `HH:MM`, as an `<input type="time">` sends it; the date is the leg's. */
  time?: string;
  /** As the form sends it, or already a number. */
  seats?: string | number;
  note?: string;
}

export interface NewRide {
  location: string;
  time: WallTime;
  seats: number;
  /** `null` when the field is left empty. */
  note: string | null;
}

export type RideValidation = { ok: true; ride: NewRide } | { ok: false; errors: RideErrors; first: RideField };

function time(value: string | undefined): { value: WallTime } | { error: RideError } {
  if (!value) return { error: "required" };
  if (!isWallTime(value)) return { error: "invalid" };
  return { value };
}

function seats(value: string | number | undefined): { value: number } | { error: RideError } {
  let count: number;
  if (typeof value === "number") {
    count = value;
  } else {
    const trimmed = (value ?? "").trim();
    if (trimmed === "") return { error: "required" };
    if (!WHOLE_NUMBER.test(trimmed)) return { error: "invalid" };
    count = Number(trimmed);
  }
  if (!Number.isInteger(count)) return { error: "invalid" };
  if (count < RIDE_SEATS_MIN || count > RIDE_SEATS_MAX) return { error: "outOfRange" };
  return { value: count };
}

export function validateRide(fields: RideFields): RideValidation {
  const checked = {
    location: text(fields.location, RIDE_LOCATION_MAX),
    time: time(fields.time),
    seats: seats(fields.seats),
    note: optionalText(fields.note, RIDE_NOTE_MAX),
  };
  const { location, time: at, seats: count, note } = checked;
  if ("error" in location || "error" in at || "error" in count || "error" in note) {
    const errors: RideErrors = {};
    let first: RideField | undefined;
    for (const field of RIDE_FIELDS) {
      const result = checked[field];
      if (!("error" in result)) continue;
      errors[field] = result.error;
      first ??= field;
    }
    // One field at least is in error: the fallback is only there for the type.
    return { ok: false, errors, first: first ?? "location" };
  }
  return { ok: true, ride: { location: location.value, time: at.value, seats: count.value, note: note.value } };
}

export type SeatReduction = { ok: true; leaving: string[] } | { ok: false; error: "passengersChanged" };

/**
 * C8.4 and C8.5: going down to `newSeats`, exactly the passengers beyond them leave, and
 * the driver has named them among the passengers read under the Ride's lock. Any other
 * count means the passengers changed since the driver chose: nothing changes, and the
 * step reopens with the current passengers.
 */
export function seatReduction(
  passengerIds: readonly string[],
  newSeats: number,
  leaving: readonly string[],
): SeatReduction {
  const passengers = new Set(passengerIds);
  const chosen = new Set(leaving);
  const expected = Math.max(0, passengers.size - newSeats);
  const fits =
    chosen.size === leaving.length && chosen.size === expected && leaving.every((id) => passengers.has(id));
  return fits ? { ok: true, leaving: [...leaving] } : { ok: false, error: "passengersChanged" };
}

/** A Ride as read under its lock, and who is asked into it. */
export interface SeatsRequest {
  /** The Ride's passenger seats. */
  seats: number;
  /** Its passengers now. */
  passengerIds: readonly string[];
  /** Who is asked in: one person for a tap, those ticked in the sheet. */
  personIds: readonly string[];
  /** On this leg, the persons already in another car, or driving: in no case placed here. */
  elsewhereIds: readonly string[];
}

/**
 * - `notEnoughSeats`: fewer free seats than persons to place; `free` is what is left, for
 *   the sheet to show (C6.5). A tap reports it as the seat just taken (C5.7).
 * - `alreadyInCar`: someone asked is already in another car on this leg, or drives.
 */
export type SeatsDecision =
  | { ok: true; place: string[] }
  | { ok: false; error: "alreadyInCar" }
  | { ok: false; error: "notEnoughSeats"; free: number };

/**
 * All or nothing (C6.5): either everyone asked has a seat, or no one is placed. Someone
 * already in this car is a success with nothing to write (C5.8), so a request sent again
 * after a lost response does not place anyone twice. `place` is who to write.
 */
export function seatsDecision(request: SeatsRequest): SeatsDecision {
  const passengers = new Set(request.passengerIds);
  const elsewhere = new Set(request.elsewhereIds);
  const place = [...new Set(request.personIds)].filter((id) => !passengers.has(id));
  if (place.some((id) => elsewhere.has(id))) return { ok: false, error: "alreadyInCar" };
  const free = Math.max(0, request.seats - passengers.size);
  if (place.length > free) return { ok: false, error: "notEnoughSeats", free };
  return { ok: true, place };
}
