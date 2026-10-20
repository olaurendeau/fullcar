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
import { text, type TextError } from "./text";

export const TITLE_MAX = 80;
export const LOCATION_MAX = 120;
/** How far ahead an event may be, in days: catches a wrong year. */
const HORIZON_DAYS = 365;

/** The fields that can carry an error, in the order of the form: the first one gets the focus. */
export const EVENT_FIELDS = ["title", "location", "allerDate", "allerTime", "retourDate", "retourTime"] as const;
export type EventField = (typeof EVENT_FIELDS)[number];

/** Error codes, translated by the view. */
export type EventError = TextError | "tooEarly" | "tooLate" | "notAfterAller";
export type EventErrors = Partial<Record<EventField, EventError>>;

/** What the form sends. A missing text counts as empty, a missing option as disabled. */
export interface EventFields {
  title?: string;
  location?: string;
  allerDate?: string;
  allerTime?: string;
  /** The "Retour" box: unchecked, the retour fields are ignored. */
  retour: boolean;
  retourDate?: string;
  retourTime?: string;
  boosters?: boolean;
  participation?: boolean;
  stops?: boolean;
}

/** What a change of the Event can touch, and what the page shows at its top. */
export interface EventHeader {
  title: string;
  location: string;
  allerAt: WallClock;
  retourAt: WallClock | null;
}

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
export type EventChangeValidation = { ok: true; event: EventHeader } | { ok: false; errors: EventErrors };

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
    allerDate: text("allerDate"),
    allerTime: text("allerTime"),
    retour: box("retour"),
    retourDate: text("retourDate"),
    retourTime: text("retourTime"),
    boosters: box("boosters"),
    participation: box("participation"),
    stops: box("stops"),
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
      boostersEnabled: fields.boosters === true,
      participationEnabled: fields.participation === true,
      stopsEnabled: fields.stops === true,
    },
  };
}

/**
 * A change follows the rules of the creation, with one difference (M2.4): a date equal to
 * the saved one is accepted even when it is past, so that an event already started can
 * still be changed. A changed date is bounded as at the creation. The options are not
 * part of a change.
 */
export function validateEventChange(
  fields: EventFields,
  bounds: DateBounds,
  before: EventHeader,
): EventChangeValidation {
  return validate(fields, bounds, {
    allerDate: wallClockParts(before.allerAt).date,
    retourDate: before.retourAt === null ? undefined : wallClockParts(before.retourAt).date,
  });
}

function validate(fields: EventFields, bounds: DateBounds, kept: KeptDates): EventChangeValidation {
  const errors: EventErrors = {};
  const checked = {
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
  return { ok: true, event: { title, location, allerAt, retourAt: retourAt ?? null } };
}
