/**
 * The clock of the purge and of « Mes événements »: today in Paris, whether an event is
 * past, and its day 30 (glossary: Purge).
 *
 * An event's times are wall-clock times with no zone (architecture, « Heures sans
 * fuseau »). To compare them with now, now is read on a clock in the reference zone,
 * Europe/Paris, whatever zone the server or the browser runs in (OA6.1, OA2.7, OA8.1). The
 * results are WallClocks and WallDates, compared as strings like the event's own times.
 */
import { addDays, wallClockParts, type WallClock, type WallDate } from "./wall-clock";

/** The zone in which "today", "past" and "day 30" are counted. */
export const REFERENCE_ZONE = "Europe/Paris";

/** How many days after the date of the last leg its data is purged. */
export const DAY_THIRTY_DAYS = 30;

/** The two times of an event; the retour is null when it has none. */
export interface EventTimes {
  allerAt: WallClock;
  retourAt: WallClock | null;
}

const PARIS = new Intl.DateTimeFormat("en-US", {
  timeZone: REFERENCE_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** The instant `now` as a clock in Paris shows it, to the second. */
export function parisNow(now: Date): WallClock {
  const part: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const { type, value } of PARIS.formatToParts(now)) part[type] = value;
  return `${part.year}-${part.month}-${part.day} ${part.hour}:${part.minute}:${part.second}`;
}

/** Today in Paris. */
export function parisToday(now: Date): WallDate {
  return wallClockParts(parisNow(now)).date;
}

/** The time of the last leg: the retour if the event has one, otherwise the aller. */
export function lastLegAt(event: EventTimes): WallClock {
  return event.retourAt ?? event.allerAt;
}

/**
 * Whether the date and time of the event's last leg have passed in Paris (OA6.1). At the
 * very second of the leg it is not past yet.
 */
export function isPast(event: EventTimes, now: Date): boolean {
  return lastLegAt(event) < parisNow(now);
}

/** The date of the event's day 30: the date of its last leg plus 30 days (OA6.3). */
export function dayThirty(event: EventTimes): WallDate {
  return addDays(wallClockParts(lastLegAt(event)).date, DAY_THIRTY_DAYS);
}

/** Whether day 30 has begun in Paris: from its midnight on, the event is purged (OA2.7, OA8.1, OA8.2). */
export function isDayThirtyReached(event: EventTimes, now: Date): boolean {
  return dayThirty(event) <= parisToday(now);
}

/**
 * The latest last-leg date whose day 30 has begun in Paris: the purge takes every event
 * whose last leg falls on this date or earlier, whatever its hour.
 */
export function purgeCutoff(now: Date): WallDate {
  return addDays(parisToday(now), -DAY_THIRTY_DAYS);
}

/** What the purge reads of an event under its lock: its times, whether it has an account, and whether it is anonymised. */
export interface PurgedEvent extends EventTimes {
  hasAccount: boolean;
  anonymised: boolean;
}

/** What the purge does with an event: anonymise it, delete it, or leave it as it is. */
export type DayThirtyFate = "anonymise" | "delete" | "keep";

/**
 * From day 30 on, an event with an account is anonymised (OA8.1), and one without, pending
 * or left by a deleted account, is deleted (OA2.7). Before day 30, and once anonymised with
 * its account, it is kept: a second run changes nothing (OA8.2).
 */
export function dayThirtyFate(event: PurgedEvent, now: Date): DayThirtyFate {
  if (!isDayThirtyReached(event, now)) return "keep";
  if (!event.hasAccount) return "delete";
  return event.anonymised ? "keep" : "anonymise";
}
