import type { Kysely } from "kysely";
import { readTokenHolders } from "@/db/persons";
import { removePassengers } from "@/db/placements";
import { deleteRide, lockRide, ridePassengers, updateRide as writeRide, type LockedRide, type RideRef } from "@/db/rides";
import type { Database } from "@/db/schema";
import { atomically } from "@/db/transaction";
import { isCreationId } from "@/domain/creation-id";
import { devicePersonIds } from "@/domain/device";
import { LEGS, type Leg } from "@/domain/leg";
import { positionOf, type Position } from "@/domain/place";
import { isPublicId } from "@/domain/public-id";
import {
  ridePositionChange,
  seatReduction,
  validateRideChange,
  type NewRide,
  type RideErrors,
  type RideField,
} from "@/domain/ride";
import { readEventState, type EventState } from "./event-state";
import { lockLegs } from "./retour";

/**
 * - `eventEnded`: the event is anonymised (#588), before any other refusal.
 * - `noRetour`: the car is on the retour, and the event no longer has one (decision 40).
 * - `invalid`: a request no page sends (an id, a leg, a list or a position malformed, a
 *   position without its place).
 * - `forbidden`: the car is not driven by a person of the device (C8.1).
 * - `rideGone`: the car is no longer offered on that leg.
 * - `passengersChanged`: the passengers are not those the driver chose among, or the
 *   number leaving is not right (C8.4, C8.5); `passengerIds` are the passengers now, read
 *   under the Ride's lock, for the step to reopen with them.
 */
export type UpdateRideOutcome =
  | { ok: true }
  | { ok: false; error: "eventEnded" | "noRetour" | "invalid" | "forbidden" | "rideGone" }
  | { ok: false; error: "passengersChanged"; passengerIds: string[] };

/** An unknown event, or a malformed id: nothing to change, and no state to give. */
export type EventNotFound = { ok: false; error: "eventNotFound" };
export const EVENT_NOT_FOUND: EventNotFound = { ok: false, error: "eventNotFound" };

/** The outcome and the state the device now sees; or field errors, and nothing read. */
export type UpdateRideResult =
  | (UpdateRideOutcome & { state: EventState })
  | { ok: false; errors: RideErrors; first: RideField }
  | EventNotFound;

/**
 * Removing a car already removed is a success (C8.6); on a retour removed, `noRetour` (decision
 * 45); on an anonymised event, `eventEnded` (#588).
 */
export type RemoveRideOutcome = { ok: true } | { ok: false; error: "eventEnded" | "noRetour" | "invalid" | "forbidden" };

export type RemoveRideResult = (RemoveRideOutcome & { state: EventState }) | EventNotFound;

const INVALID = { ok: false, error: "invalid" } as const;
const FORBIDDEN = { ok: false, error: "forbidden" } as const;
const NO_RETOUR = { ok: false, error: "noRetour" } as const;
const EVENT_ENDED = { ok: false, error: "eventEnded" } as const;

function rideRef(eventId: string, rideId: unknown, leg: unknown): RideRef | undefined {
  if (!isCreationId(rideId) || !LEGS.some((known) => known === leg)) return undefined;
  return { id: rideId, eventId, leg: leg as Leg };
}

function ids(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every(isCreationId) ? [...value] : undefined;
}

interface Change {
  /** Only what the driver changed: a field left out stays as it is. */
  ride: Partial<NewRide>;
  /** The position of the place sent, `undefined` when not sent (a page from before the deployment). */
  position?: Position | null;
  /** The passengers the form showed while the driver chose who leaves, never read again. */
  seenPassengerIds: string[];
  leaving: string[];
}

/** The fields, checked against R4, the place's position, and the step's lists, which the form always sends. */
function readChange(fields: unknown): Change | { errors: RideErrors; first: RideField } | undefined {
  if (typeof fields !== "object" || fields === null) return undefined;
  const sent: Record<string, unknown> = { ...fields };
  const seenPassengerIds = ids(sent.seenPassengerIds);
  const leaving = ids(sent.leaving);
  const position = sent.position === undefined ? { value: undefined } : positionOf(sent.position);
  if (seenPassengerIds === undefined || leaving === undefined || "error" in position) return undefined;
  const validation = validateRideChange({ location: sent.location, time: sent.time, seats: sent.seats, note: sent.note });
  if (!validation.ok) return { errors: validation.errors, first: validation.first };
  return { ride: validation.change, position: position.value, seenPassengerIds, leaving };
}

/**
 * The Ride under its lock, if a person of the device drives it. The Event is locked first,
 * and its leg checked (`noRetour`, before any other refusal); the token's holders are then
 * read, without a lock, and the Ride is locked (lock order: Event, Ride, then Person).
 * Nothing here locks a Person.
 */
async function lockDriversRide(
  trx: Kysely<Database>,
  token: unknown,
  ride: RideRef,
): Promise<LockedRide | "eventEnded" | "noRetour" | "forbidden" | "gone"> {
  const legs = await lockLegs(trx, ride.eventId, [ride.leg]);
  // An event deleted meanwhile has no state to give: the caller answers eventNotFound.
  if (!legs.ok) return legs.error === "eventNotFound" ? "gone" : legs.error;
  const device = new Set(devicePersonIds(token, await readTokenHolders(trx, ride.eventId)));
  if (device.size === 0) return "forbidden";
  const locked = await lockRide(trx, ride);
  if (locked === undefined) return "gone";
  return device.has(locked.driverId) ? locked : "forbidden";
}

async function changeRide(trx: Kysely<Database>, token: unknown, ride: RideRef, change: Change): Promise<UpdateRideOutcome> {
  const locked = await lockDriversRide(trx, token, ride);
  if (locked === "eventEnded") return EVENT_ENDED;
  if (locked === "noRetour") return NO_RETOUR;
  if (locked === "forbidden") return FORBIDDEN;
  if (locked === "gone") return { ok: false, error: "rideGone" };
  // Against the place read under the lock (AL5.6): a car's position is always its text's.
  const placed = ridePositionChange({ location: change.ride.location, position: change.position }, locked.location);
  if ("error" in placed) return INVALID;
  // Counted under the lock (C12.11): a seat taken meanwhile has committed, or waits.
  const passengerIds = (await ridePassengers(trx, ride)).map((passenger) => passenger.personId);
  const decision = seatReduction({
    passengerIds,
    seenPassengerIds: change.seenPassengerIds,
    // Seats left out stay as they are: nobody has to leave.
    newSeats: change.ride.seats ?? locked.seats,
    leaving: change.leaving,
  });
  if (!decision.ok) return { ok: false, error: "passengersChanged", passengerIds };
  await removePassengers(trx, ride, decision.leaving);
  const { time, ...fields } = change.ride;
  const write = { ...fields, ...(time !== undefined && { departureTime: `${time}:00` }), ...placed };
  if (Object.keys(write).length > 0) await writeRide(trx, ride, write);
  return { ok: true };
}

/**
 * The driver changes their car (epic #66, R8, C8.2 to C8.5): place, time, note and seats,
 * by the rules of R4, and who leaves when the seats go below the passengers. A field left out
 * stays as it is (`validateRideChange`): a change does not undo another made since the form showed.
 * The place's position goes with it, as `ridePositionChange` decides under the Ride's lock (AL5.6).
 * `eventNotFound` for an unknown event; a malformed id is never looked up.
 *
 * The application passes the connection: the write commits in its own transaction (READ
 * COMMITTED, so that the passengers counted after the Ride's lock include a seat just
 * taken), and the state is read after the commit, on one snapshot. A transaction passed in
 * is for tests only, and loses that guarantee: in REPEATABLE READ, its snapshot is taken
 * before the lock, so a seat taken while waiting would not be counted and the reduction
 * would pass (C12.11); in READ COMMITTED, readEventState throws after the write. The token
 * is only compared, never logged nor kept.
 */
export async function updateRide(
  db: Kysely<Database>,
  eventId: string,
  token: unknown,
  rideId: unknown,
  leg: unknown,
  fields: unknown,
): Promise<UpdateRideResult> {
  if (!isPublicId(eventId)) return EVENT_NOT_FOUND;
  const ride = rideRef(eventId, rideId, leg);
  const change = ride && readChange(fields);
  if (change && "errors" in change) return { ok: false, ...change };
  const outcome: UpdateRideOutcome =
    ride && change ? await atomically(db, (trx) => changeRide(trx, token, ride, change)) : INVALID;
  const state = await readEventState(db, eventId, token);
  return state ? { ...outcome, state } : EVENT_NOT_FOUND;
}

/**
 * The driver removes their car (C8.6). Its passengers are left without a car on the leg by
 * the `placement → ride` key, and the driver, who has no Placement there, is not concerned.
 * `eventNotFound` for an unknown event; a malformed id is never looked up. Committed, then
 * the state is read, as for updateRide, and a transaction passed in is for tests only.
 */
export async function removeRide(
  db: Kysely<Database>,
  eventId: string,
  token: unknown,
  rideId: unknown,
  leg: unknown,
): Promise<RemoveRideResult> {
  if (!isPublicId(eventId)) return EVENT_NOT_FOUND;
  const ride = rideRef(eventId, rideId, leg);
  const outcome: RemoveRideOutcome = ride
    ? await atomically(db, async (trx) => {
        const locked = await lockDriversRide(trx, token, ride);
        if (locked === "eventEnded") return EVENT_ENDED;
        if (locked === "noRetour") return NO_RETOUR;
        if (locked === "forbidden") return FORBIDDEN;
        if (locked !== "gone") await deleteRide(trx, ride);
        return { ok: true } as const;
      })
    : INVALID;
  const state = await readEventState(db, eventId, token);
  return state ? { ...outcome, state } : EVENT_NOT_FOUND;
}
