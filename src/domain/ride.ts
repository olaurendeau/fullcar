/**
 * The rules of a Ride (epic #66): the form "Proposer une voiture" (R4), reducing the
 * seats (R8, C8.4 and C8.5), the all-or-nothing decision of taking seats (C5.7, C5.8,
 * C6.5), and who boards a car as it is offered (C4.13). Pure functions: the caller reads
 * the Ride under its lock, then writes what they decide.
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

/**
 * What the form sends: text, or nothing, which counts as empty. Typed `unknown`, since a
 * forged request can send anything; a value of the wrong type is `invalid`.
 */
export interface RideFields {
  location?: unknown;
  /** `HH:MM`, as an `<input type="time">` sends it; the date is the leg's. */
  time?: unknown;
  /** As the form sends it, or already a number. */
  seats?: unknown;
  note?: unknown;
}

export interface NewRide {
  location: string;
  time: WallTime;
  seats: number;
  /** `null` when the field is left empty. */
  note: string | null;
}

export type RideValidation = { ok: true; ride: NewRide } | { ok: false; errors: RideErrors; first: RideField };

function time(value: unknown): { value: WallTime } | { error: RideError } {
  if (value === undefined || value === null || value === "") return { error: "required" };
  if (typeof value !== "string" || !isWallTime(value)) return { error: "invalid" };
  return { value };
}

function seats(value: unknown): { value: number } | { error: RideError } {
  const raw = value ?? "";
  let count: number;
  if (typeof raw === "number") {
    count = raw;
  } else {
    if (typeof raw !== "string") return { error: "invalid" };
    const trimmed = raw.trim();
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

/**
 * A change of a Ride (C8.2): a field left out (`undefined`) stays as it is, so that a form
 * filled before another change landed does not undo it; the others follow `validateRide`.
 */
export function validateRideChange(fields: RideFields) {
  const given = RIDE_FIELDS.filter((name) => fields[name] !== undefined);
  // A field left out is read as a valid one, then left out of the change.
  const sent = Object.fromEntries(given.map((name) => [name, fields[name]]));
  const checked = validateRide({ location: "-", time: "00:00", seats: RIDE_SEATS_MIN, ...sent });
  if (!checked.ok) return checked;
  const change: Partial<NewRide> = Object.fromEntries(given.map((name) => [name, checked.ride[name]]));
  return { ok: true as const, change };
}

/**
 * C4.13: those ticked in « Qui monte avec vous ? » board the new car, so at most as many
 * as its seats. The form and the server both apply it.
 */
export function passengersFit(count: number, seats: number): boolean {
  return count <= seats;
}

/** The seats as R4 reads them, whatever the other fields; nothing when they are in error. */
export function validSeats(value: unknown): number | undefined {
  const checked = seats(value);
  return "value" in checked ? checked.value : undefined;
}

export type SeatReduction = { ok: true; leaving: string[] } | { ok: false; error: "passengersChanged" };

/** A seat reduction as the driver sent it, and the Ride's passengers as read under its lock. */
export interface SeatReductionRequest {
  /** The passengers now. */
  passengerIds: readonly string[];
  /** The passengers the driver saw when choosing who leaves. */
  seenPassengerIds: readonly string[];
  newSeats: number;
  /** Who the driver chose to leave. */
  leaving: readonly string[];
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((id) => b.has(id));
}

/**
 * C8.4: going down to `newSeats`, exactly the passengers beyond them leave, each named
 * once, all of them passengers.
 * C8.5: once someone has to leave, the driver chose among the passengers they saw; if
 * those are not the passengers now (someone boarded or left in between, even with the
 * same count), the choice no longer holds. Nothing changes, and the step reopens with the
 * current passengers. When everyone still fits and no one is named, there was no choice.
 */
export function seatReduction(request: SeatReductionRequest): SeatReduction {
  const { newSeats, leaving } = request;
  const passengers = new Set(request.passengerIds);
  const chosen = new Set(leaving);
  const expected = Math.max(0, passengers.size - newSeats);
  const choiceHolds = leaving.length === 0 || sameSet(passengers, new Set(request.seenPassengerIds));
  const fits =
    choiceHolds &&
    chosen.size === leaving.length &&
    chosen.size === expected &&
    leaving.every((id) => passengers.has(id));
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
 * - `notEnoughSeats`: fewer free seats than persons to place; `freeSeats` is what is left, for
 *   the sheet to show (C6.5). A tap reports it as the seat just taken (C5.7).
 * - `alreadyInCar`: someone asked is already in another car on this leg, or drives.
 */
export type SeatsDecision =
  | { ok: true; place: string[] }
  | { ok: false; error: "alreadyInCar" }
  | { ok: false; error: "notEnoughSeats"; freeSeats: number };

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
  // Never below zero, should the seats have gone under the passengers.
  const freeSeats = Math.max(0, request.seats - passengers.size);
  if (place.length > freeSeats) return { ok: false, error: "notEnoughSeats", freeSeats };
  return { ok: true, place };
}
