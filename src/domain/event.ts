/**
 * The rules for creating an Event (epic #3, R1 to R3), and for changing one (epic #250).
 * The same rules run in the browser, against the device's date, and on the server,
 * against the UTC date with a day of tolerance either way: only the bounds differ.
 */
import {
  addDays,
  isWallDate,
  isWallTime,
  localDate,
  toWallClock,
  utcDate,
  wallClockParts,
  type WallClock,
  type WallDate,
} from "./wall-clock";
import { description } from "./description";
import { positionOf, type Position } from "./place";
import { text, type TextError } from "./text";

export const TITLE_MAX = 80;
export const LOCATION_MAX = 120;
/** How far ahead an event may be, in days: catches a wrong year. */
const HORIZON_DAYS = 365;

/**
 * The fields that can carry an error, in the order of the form: the first one gets the focus.
 * The description comes after the end, before the options (event-description v3, « Écrire »).
 */
export const EVENT_FIELDS = ["title", "location", "allerDate", "allerTime", "retourDate", "retourTime", "description"] as const;
export type EventField = (typeof EVENT_FIELDS)[number];

/** Error codes, translated by the view. */
export type EventError = TextError | "tooEarly" | "tooLate" | "notAfterAller";
export type EventErrors = Partial<Record<EventField, EventError>>;

/**
 * What the form sends. A missing text counts as empty, a missing option as disabled; at the
 * change, `stops` alone is read as sent or not (D1): a request without it leaves the option.
 */
export interface EventFields {
  title?: string;
  location?: string;
  /**
   * The position of the location, as sent: `undefined` is not sent, anything else is checked
   * by `positionOf`. Only sent with `location`.
   */
  locationPosition?: unknown;
  allerDate?: string;
  allerTime?: string;
  /** The "Retour" box: unchecked, the retour fields are ignored. */
  retour: boolean;
  retourDate?: string;
  retourTime?: string;
  /**
   * The description, as sent: `undefined` is not sent, anything else is checked by
   * `description`, so that a value that is not a string is `invalid`, not missing.
   */
  description?: unknown;
  boosters?: boolean;
  participation?: boolean;
  stops?: boolean;
}

/** What a change of the Event can touch, and what the page shows at its top. */
export interface EventHeader {
  title: string;
  location: string;
  /** The point of the suggestion chosen for the location, or `null` (D5: anyone with the link sees it). */
  locationPosition: Position | null;
  allerAt: WallClock;
  retourAt: WallClock | null;
  /** The organiser's text, normalised, or `null` (event-description v3: anyone with the link reads it). */
  description: string | null;
}

/**
 * A change of the header: without `locationPosition`, the saved position is kept (D6, AL5.6);
 * without `description`, the saved description is kept.
 */
export type EventChange = Omit<EventHeader, "locationPosition" | "description"> & {
  locationPosition?: Position | null;
  description?: string | null;
  /**
   * The option « Points de RDV » (epic #881, D1): the only option a change may touch. Sent,
   * it is written; as `before`, it is the value the page loaded. Not sent, the option stays.
   */
  stops?: boolean;
};

/**
 * What « Modifier l’événement » loaded and sends back as `before`: the header and, since the
 * option can be turned on there (D1), the option « Points de RDV ». A page from before it has none.
 */
export type EventBefore = EventHeader & { stops?: boolean };

export interface NewEvent extends EventHeader {
  boostersEnabled: boolean;
  participationEnabled: boolean;
  stopsEnabled: boolean;
}

/** The first and last accepted dates, both included. */
export interface DateBounds {
  min: WallDate;
  max: WallDate;
}

export type EventValidation = { ok: true; event: NewEvent } | { ok: false; errors: EventErrors };
export type EventChangeValidation = { ok: true; event: EventChange } | { ok: false; errors: EventErrors };

/**
 * What a request may send is anything: only strings are read as text and only `true`
 * enables a box, so that a forged request gets field errors, never a server error.
 */
export function eventFieldsOf(input: unknown): EventFields {
  const fields: Record<string, unknown> = typeof input === "object" && input !== null ? { ...input } : {};
  const text = (name: string) => (typeof fields[name] === "string" ? fields[name] : undefined);
  const box = (name: string) => fields[name] === true;
  return {
    title: text("title"),
    location: text("location"),
    locationPosition: fields.locationPosition,
    allerDate: text("allerDate"),
    allerTime: text("allerTime"),
    retour: box("retour"),
    retourDate: text("retourDate"),
    retourTime: text("retourTime"),
    description: fields.description,
    boosters: box("boosters"),
    participation: box("participation"),
    // Unlike the other boxes, a change tells "not sent" from "off": only a boolean is a value.
    stops: typeof fields.stops === "boolean" ? fields.stops : undefined,
  };
}

/** In the browser: from the device's today to today + 365 days. */
export function deviceBounds(now: Date): DateBounds {
  const today = localDate(now);
  return { min: today, max: addDays(today, HORIZON_DAYS) };
}

/**
 * On the server: one day of tolerance at each end around the UTC today, so that an
 * organiser ahead of or behind UTC is never refused their own today or today + 365.
 */
export function serverBounds(now: Date): DateBounds {
  const today = utcDate(now);
  return { min: addDays(today, -1), max: addDays(today, HORIZON_DAYS + 1) };
}

/**
 * The position sent with the location: `undefined` when none is sent. Malformed, out of
 * bounds, or sent without a location, it comes from a request no page sends: invalid.
 */
export function locationPositionOf(fields: EventFields): { value: Position | null | undefined } | { error: "invalid" } {
  if (fields.locationPosition === undefined) return { value: undefined };
  if (fields.location === undefined) return { error: "invalid" };
  return positionOf(fields.locationPosition);
}

export function firstInvalidField(errors: EventErrors): EventField | undefined {
  return EVENT_FIELDS.find((field) => errors[field] !== undefined);
}

/** The saved dates a change may keep, past or not. */
interface KeptDates {
  allerDate?: WallDate;
  retourDate?: WallDate;
}

function date(
  value: string | undefined,
  bounds: DateBounds,
  kept: WallDate | undefined,
): { value: WallDate } | { error: EventError } {
  if (!value) return { error: "required" };
  if (!isWallDate(value)) return { error: "invalid" };
  if (value === kept) return { value };
  if (value < bounds.min) return { error: "tooEarly" };
  if (value > bounds.max) return { error: "tooLate" };
  return { value };
}

function time(value: string | undefined): { value: string } | { error: EventError } {
  if (!value) return { error: "required" };
  if (!isWallTime(value)) return { error: "invalid" };
  return { value };
}

export function validateEvent(fields: EventFields, bounds: DateBounds): EventValidation {
  const result = validate(fields, bounds, {});
  if (!result.ok) return result;
  return {
    ok: true,
    event: {
      ...result.event,
      locationPosition: result.event.locationPosition ?? null,
      description: result.event.description ?? null,
      boostersEnabled: fields.boosters === true,
      participationEnabled: fields.participation === true,
      stopsEnabled: fields.stops === true,
    },
  };
}

/**
 * A change follows the rules of the creation, with one difference (M2.4): a date equal to
 * the saved one is accepted even when it is past, so that an event already started can
 * still be changed. A changed date is bounded as at the creation. Of the options, a change
 * keeps `stops` when it is sent (D1) and nothing else: the boosters and the participation are
 * not part of it.
 */
export function validateEventChange(
  fields: EventFields,
  bounds: DateBounds,
  before: EventChange,
): EventChangeValidation {
  const result = validate(fields, bounds, {
    allerDate: wallClockParts(before.allerAt).date,
    retourDate: before.retourAt === null ? undefined : wallClockParts(before.retourAt).date,
  });
  if (!result.ok || fields.stops === undefined) return result;
  return { ok: true, event: { ...result.event, stops: fields.stops } };
}

function validate(fields: EventFields, bounds: DateBounds, kept: KeptDates): EventChangeValidation {
  const errors: EventErrors = {};
  const checked: Partial<Record<EventField, { value: string } | { error: EventError }>> = {
    title: text(fields.title, TITLE_MAX),
    location: text(fields.location, LOCATION_MAX),
    allerDate: date(fields.allerDate, bounds, kept.allerDate),
    allerTime: time(fields.allerTime),
    ...(fields.retour && {
      retourDate: date(fields.retourDate, bounds, kept.retourDate),
      retourTime: time(fields.retourTime),
    }),
  };
  const values: Partial<Record<EventField, string>> = {};
  for (const field of EVENT_FIELDS) {
    const result = checked[field];
    if (!result) continue;
    if ("error" in result) errors[field] = result.error;
    else values[field] = result.value;
  }
  // A position the form never sends says more than the text's own error.
  const position = locationPositionOf(fields);
  if ("error" in position) errors.location = position.error;
  // Not sent, the description is not checked: a change then keeps the saved one.
  const said = fields.description === undefined ? undefined : description(fields.description);
  if (said !== undefined && "error" in said) errors.description = said.error;

  const { title, location, allerDate, allerTime, retourDate, retourTime } = values;
  const allerAt = allerDate && allerTime ? toWallClock(allerDate, allerTime) : undefined;
  // Only set with the "Retour" box checked: the retour fields are not even read otherwise.
  const retourAt = retourDate && retourTime ? toWallClock(retourDate, retourTime) : undefined;
  if (allerAt && retourAt && retourAt <= allerAt) {
    // On the field to change: the date if it is the earlier one, else the time.
    errors[retourDate && allerDate && retourDate < allerDate ? "retourDate" : "retourTime"] = "notAfterAller";
  }

  // Without an error, every value is there; the checks after the first narrow the types.
  if (firstInvalidField(errors) !== undefined || !title || !location || !allerAt) {
    return { ok: false, errors };
  }
  const event: EventChange = { title, location, allerAt, retourAt: retourAt ?? null };
  if ("value" in position && position.value !== undefined) event.locationPosition = position.value;
  if (said !== undefined && "value" in said) event.description = said.value;
  return { ok: true, event };
}
