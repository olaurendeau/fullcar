import type { Kysely } from "kysely";
import { lockPersons, readTokenHolders } from "@/db/persons";
import { setPlacement } from "@/db/placements";
import { lockRide, ridePassengers, type RideRef } from "@/db/rides";
import type { Database } from "@/db/schema";
import { atomically } from "@/db/transaction";
import { isCreationId } from "@/domain/creation-id";
import { eventAccess } from "@/domain/device";
import { isPublicId } from "@/domain/public-id";
import { EVENT_NOT_FOUND, type EventNotFound } from "./change-ride";
import { readEventState, type DeviceState } from "./event-state";
import { lockLegs } from "./retour";

/**
 * The point of the request, as a page sends it: absent or `null` is the Ride's start, a
 * creation id is a Stop, anything else is `undefined` (malformed). `null` for the start.
 */
export function requestedStop(stopId: unknown): string | null | undefined {
  if (stopId === undefined || stopId === null) return null;
  return isCreationId(stopId) ? stopId : undefined;
}

/**
 * Whether the Stop is a Stop of that Ride on the aller (RV3.4, RV4.3): false once deleted, for
 * a Stop of another Ride, and for any Ride of the retour, which has none. Called under the
 * Ride's lock, which every write of a Stop takes, so the answer holds until the transaction ends.
 */
export async function isStopOfRide(db: Kysely<Database>, ride: RideRef, stopId: string): Promise<boolean> {
  if (ride.leg !== "aller") return false;
  const row = await db
    .selectFrom("stop")
    .select("id")
    .where("id", "=", stopId)
    .where("ride_id", "=", ride.id)
    .where("event_id", "=", ride.eventId)
    .where("leg", "=", ride.leg)
    .executeTakeFirst();
  return row !== undefined;
}

/**
 * - `eventEnded`: the event is anonymised (#588), before any other refusal.
 * - `invalid`: a request no page sends (an id malformed).
 * - `personGone`: the person is not one of the event (any more, RP5.4). Whose token created her
 *   does not matter, nor whether the request has one: whoever has the link changes her point
 *   (epic #973).
 * - `stopsOff`: the event's option « Points de RDV » is off (RV8.3): nothing is written.
 * - `rideGone`: the car is no longer offered on the aller.
 * - `notInCar`: the person is no longer in that car: she left it, or took another.
 * - `stopGone` on success: the Stop is gone, and the person boards at the Ride's start (RV4.3).
 */
export type BoardingStopOutcome =
  | { ok: true; stopGone?: true }
  | { ok: false; error: "eventEnded" | "invalid" | "rideGone" | "notInCar" | "stopsOff" }
  | { ok: false; error: "personGone"; goneIds: string[] };

/** The outcome, and the event's state as the device now sees it, refusal or not. */
export type BoardingStopResult = BoardingStopOutcome & { state: DeviceState };

/** What the transaction gives: an unknown event has no state to give with its outcome. */
type Written<Outcome> = Outcome | EventNotFound;

/**
 * Under the Event's lock (the aller), the Ride's, then the person's (lock order: Event, Ride,
 * Person), the person boards at another point of the car she is in: her seat and the boarding
 * time stay (RV4.4). The same point as before is a success without a write (RV4.2).
 */
async function changeBoarding(
  trx: Kysely<Database>,
  eventId: string,
  rideId: unknown,
  personId: unknown,
  stopId: unknown,
): Promise<Written<BoardingStopOutcome>> {
  const legs = await lockLegs(trx, eventId, ["aller"]);
  // The aller always exists: `noRetour` cannot come from it.
  if (!legs.ok) return legs as { ok: false; error: "eventNotFound" | "eventEnded" };
  if (!legs.stopsEnabled) return { ok: false, error: "stopsOff" };
  const requested = requestedStop(stopId);
  if (!isCreationId(rideId) || !isCreationId(personId) || requested === undefined) return { ok: false, error: "invalid" };
  // Whoever has the link changes the point of any person of the event (epic #973).
  const access = eventAccess(await readTokenHolders(trx, eventId), [personId]);
  if (access.kind === "personGone") return { ok: false, error: "personGone", goneIds: access.goneIds };
  const ride = { id: rideId, eventId, leg: "aller" } as const;
  if ((await lockRide(trx, ride)) === undefined) return { ok: false, error: "rideGone" };
  // Removed after the read, while this waited for her Person (RP5.4).
  if ((await lockPersons(trx, eventId, [personId])).length === 0) return { ok: false, error: "personGone", goneIds: [personId] };
  const passengers = await ridePassengers(trx, ride);
  if (!passengers.some((passenger) => passenger.personId === personId)) return { ok: false, error: "notInCar" };
  const stopGone = requested !== null && !(await isStopOfRide(trx, ride, requested));
  const target = stopGone ? null : requested;
  const before = await trx
    .selectFrom("placement")
    .select("stop_id")
    .where("person_id", "=", personId)
    .where("event_id", "=", eventId)
    .where("leg", "=", "aller")
    .executeTakeFirstOrThrow();
  if (before.stop_id !== target) {
    await setPlacement(trx, { personId, eventId, leg: "aller", rideId, stopId: target });
  }
  return stopGone ? { ok: true, stopGone: true } : { ok: true };
}

/**
 * « Changer le point » (RV4.2 to RV4.4): a person of the event, already in a car of the aller,
 * boards at another point of it, or at its start with `null`; then reads the event's state for
 * it. « Annuler » calls it again with the point before. `eventNotFound` for an unknown event,
 * forged request or not; a malformed id is never looked up. As for takeSeats, the write
 * commits in its own transaction and the state is read after the commit; the token only
 * decides which numbers the state shows, and is never logged nor kept.
 */
export async function setBoardingStop(
  db: Kysely<Database>,
  eventId: string,
  token: unknown,
  rideId: unknown,
  personId: unknown,
  stopId: unknown,
): Promise<BoardingStopResult | EventNotFound> {
  if (!isPublicId(eventId)) return EVENT_NOT_FOUND;
  const outcome = await atomically(db, (trx) => changeBoarding(trx, eventId, rideId, personId, stopId));
  if (!outcome.ok && outcome.error === "eventNotFound") return EVENT_NOT_FOUND;
  const state = await readEventState(db, eventId, token);
  return state ? { ...outcome, state } : EVENT_NOT_FOUND;
}
