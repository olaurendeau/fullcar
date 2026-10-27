/**
 * « Mes événements » (epic #581, OA6.1–OA6.4, OA2.3): the organiser's events, upcoming then
 * past, as the page lists them. Pure: the rows come from src/db/my-events.ts, in aggregates
 * only, and the clock is given.
 *
 * Which events are listed is not decided here: a row is listed when organiser-access.ts,
 * given the session's account and no admin token, opens it to that session or says it ended
 * for it (OA8.4). So a pending event, one of another account, or one left without an
 * organiser is never listed (OA2.3), whatever the rows hold. « Passé » and day 30 are
 * day-thirty.ts's, at Paris time.
 */
import { dayThirty, isDayThirtyReached, isPast } from "./day-thirty";
import { eventLegs, type Leg } from "./leg";
import { decideOrganiserAccess } from "./organiser-access";
import type { WallClock, WallDate } from "./wall-clock";

/** What is read of one event: its own fields, and its numbers of persons, never anyone's details. */
export interface MyEventRow {
  id: string;
  title: string;
  location: string;
  allerAt: WallClock;
  retourAt: WallClock | null;
  /** The confirmed organiser's account; null while pending, or once the account is deleted. */
  accountId: string | null;
  confirmed: boolean;
  anonymised: boolean;
  /** The persons signed up. */
  persons: number;
  /** The persons without a car, on each leg. */
  withoutCar: Record<Leg, number>;
}

/** The persons without a car on one leg, for the amber badge (`MyEvents.withoutCar`). */
export interface LegWithoutCar {
  leg: Leg;
  count: number;
}

interface ListedEvent {
  id: string;
  title: string;
  /** The aller's wall-clock time. */
  start: WallClock;
  location: string;
}

interface CountedEvent extends ListedEvent {
  /** `MyEvents.persons`. */
  persons: number;
  /** One per leg of the event with at least one person without a car, aller first (OA6.2). */
  withoutCar: LegWithoutCar[];
}

/** Not past yet (OA6.2). */
export interface UpcomingEvent extends CountedEvent {
  state: "upcoming";
}

/**
 * Past, not anonymised yet: its sign-ups are erased on `erasedOn`, day 30 in Paris (OA6.3).
 * Null once day 30 has begun and the purge has not run yet (it runs at 03:00 UTC, and may
 * fail): no date to come is left to give, and the page says « sous peu » (#607).
 */
export interface PastEvent extends CountedEvent {
  state: "past";
  erasedOn: WallDate | null;
}

/** Anonymised: « Inscriptions effacées », and no count (OA6.4). */
export interface ErasedEvent extends ListedEvent {
  state: "erased";
}

/** The two sections: upcoming, soonest start first; past, latest start first (OA6.1). */
export interface MyEventsList {
  upcoming: UpcomingEvent[];
  past: (PastEvent | ErasedEvent)[];
}

/** Whether the session of `account`, alone, is this event's organiser, as organiser-access.ts says. */
function isOrganisedBy(row: MyEventRow, account: { id: string; email: string }): boolean {
  // No admin token is compared: the list is what the session opens, not the creation browser.
  const event = { id: row.id, accountId: row.accountId, confirmed: row.confirmed, anonymised: row.anonymised, adminTokenHash: null };
  const decision = decideOrganiserAccess(event, { adminToken: undefined, account });
  return decision.state === "organiser" || decision.state === "ended";
}

function counted(row: MyEventRow): CountedEvent {
  const withoutCar = eventLegs(row.retourAt)
    .map((leg) => ({ leg, count: row.withoutCar[leg] }))
    .filter(({ count }) => count > 0);
  return { id: row.id, title: row.title, start: row.allerAt, location: row.location, persons: row.persons, withoutCar };
}

function byStart(a: ListedEvent, b: ListedEvent): number {
  if (a.start !== b.start) return a.start < b.start ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The events of `account`'s session at `now`, in their sections and their order (OA6.1–OA6.4). */
export function listMyEvents(rows: readonly MyEventRow[], account: { id: string; email: string }, now: Date): MyEventsList {
  const upcoming: UpcomingEvent[] = [];
  const past: (PastEvent | ErasedEvent)[] = [];
  for (const row of rows) {
    if (!isOrganisedBy(row, account)) continue;
    if (row.anonymised) {
      past.push({ state: "erased", id: row.id, title: row.title, start: row.allerAt, location: row.location });
    } else if (isPast(row, now)) {
      past.push({ state: "past", ...counted(row), erasedOn: isDayThirtyReached(row, now) ? null : dayThirty(row) });
    } else {
      upcoming.push({ state: "upcoming", ...counted(row) });
    }
  }
  upcoming.sort(byStart);
  past.sort((a, b) => byStart(b, a));
  return { upcoming, past };
}
