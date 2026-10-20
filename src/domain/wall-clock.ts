/**
 * Wall-clock dates and times: the local time of the event's place, with no time zone.
 *
 * They stay strings from the form to the database and back, so that no conversion
 * through the server's or the browser's time zone can move them. Strings of the same
 * shape compare in calendar order, so comparing them needs no `Date` either.
 */

/** A calendar date, `YYYY-MM-DD`, as an `<input type="date">` sends it. */
export type WallDate = string;
/** A time of day, `HH:MM`, as an `<input type="time">` sends it. */
export type WallTime = string;
/** A date and a time, `YYYY-MM-DD HH:MM:SS`, as Postgres stores and returns a `timestamp(0)`. */
export type WallClock = string;

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const CLOCK = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}):\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

/** The calendar day of a UTC instant, used only as a day counter: no zone is involved. */
function fromUtcDay(at: Date): WallDate {
  return `${pad(at.getUTCFullYear(), 4)}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`;
}

export function isWallDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const at = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC rolls 2026-02-30 over to 2026-03-02: a date that exists comes back unchanged.
  return at.getUTCFullYear() === year && at.getUTCMonth() === month - 1 && at.getUTCDate() === day;
}

export function isWallTime(value: string): boolean {
  return TIME.test(value);
}

/** `date` moved by `days` calendar days, either way. `date` must be a valid WallDate. */
export function addDays(date: WallDate, days: number): WallDate {
  const [year, month, day] = date.split("-").map(Number);
  return fromUtcDay(new Date(Date.UTC(year, month - 1, day) + days * DAY_MS));
}

/** Today on this device, in its own time zone: what the organiser calls "today". */
export function localDate(now: Date): WallDate {
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Today in UTC: the server's "today", whatever zone it runs in. */
export function utcDate(now: Date): WallDate {
  return fromUtcDay(now);
}

export function toWallClock(date: WallDate, time: WallTime): WallClock {
  return `${date} ${time}:00`;
}

/** The date and time of a WallClock, as the form shows them. */
export function wallClockParts(at: WallClock): { date: WallDate; time: WallTime } {
  const match = CLOCK.exec(at);
  if (!match) throw new Error("not a wall-clock timestamp");
  return { date: match[1], time: match[2] };
}

/**
 * Whether two WallClocks fall on the same calendar day of the event's place (D1.7): their
 * digits, never a time zone, decide.
 */
export function sameWallDate(a: WallClock, b: WallClock): boolean {
  return wallClockParts(a).date === wallClockParts(b).date;
}

/**
 * The instant whose UTC reading has the WallClock's digits. Formatted with
 * `timeZone: "UTC"`, it shows the same date and time in every browser's zone.
 */
export function wallClockAsUtc(at: WallClock): Date {
  const { date, time } = wallClockParts(at);
  return new Date(`${date}T${time}:00Z`);
}
