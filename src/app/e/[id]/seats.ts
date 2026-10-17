import type { Kysely } from "kysely";
import { lockPersons, readTokenHolders } from "@/db/persons";
import { seatedOnLeg, setPlacement } from "@/db/placements";
import { lockRide, ridePassengers } from "@/db/rides";
import type { Database } from "@/db/schema";
import { atomically } from "@/db/transaction";
import { isCreationId } from "@/domain/creation-id";
import { devicePersonIds } from "@/domain/device";
import { LEGS, type Leg } from "@/domain/leg";
import { isPublicId } from "@/domain/public-id";
import { seatsDecision } from "@/domain/ride";
import { readEventState, type EventState } from "./event-state";

/**
 * - `invalid`: a request no page sends (nobody asked, an id or a leg malformed).
 * - `forbidden`: someone asked is not a person of the device (C2.4).
 * - `rideGone`: the car is no longer offered on that leg (C6.8).
 * - `alreadyInCar`: someone asked is in another car on the leg, or drives on it (C5.6).
 * - `seatTaken`: one person asked, and the last seat was just taken (C5.7).
 * - `notEnoughSeats`: fewer seats left than persons asked, `freeSeats` of them (C6.5).
 */
export type SeatsOutcome =
  | { ok: true }
  | { ok: false; error: "invalid" | "forbidden" | "rideGone" | "alreadyInCar" | "seatTaken" }
  | { ok: false; error: "notEnoughSeats"; freeSeats: number };

/** The outcome, and the event's state as the device now sees it, refusal or not. */
export type TakeSeatsResult = SeatsOutcome & { state: EventState };

interface SeatsRequest {
  rideId: string;
  leg: Leg;
  personIds: string[];
}

/** The request as a page sends it, or nothing: at least one person, every id well-formed. */
function seatsRequest(rideId: unknown, leg: unknown, personIds: unknown): SeatsRequest | undefined {
  if (!isCreationId(rideId) || !LEGS.some((known) => known === leg)) return undefined;
  if (!Array.isArray(personIds) || personIds.length === 0 || !personIds.every(isCreationId)) return undefined;
  return { rideId, leg: leg as Leg, personIds: [...new Set<string>(personIds)] };
}

/**
 * Under the Ride's lock, then the persons' (lock order: Ride, then Person): the seats are
 * counted only once no other take can change them, and a person cannot board two cars at
 * once. All or nothing (D3); someone already in this car is placed without a write (C5.8).
 */
async function placeInRide(
  trx: Kysely<Database>,
  eventId: string,
  token: unknown,
  { rideId, leg, personIds }: SeatsRequest,
): Promise<SeatsOutcome> {
  const device = new Set(devicePersonIds(token, await readTokenHolders(trx, eventId)));
  if (!personIds.every((id) => device.has(id))) return { ok: false, error: "forbidden" };
  const ride = { id: rideId, eventId, leg };
  const locked = await lockRide(trx, ride);
  if (locked === undefined) return { ok: false, error: "rideGone" };
  await lockPersons(trx, eventId, personIds);
  const passengers = await ridePassengers(trx, ride);
  const decision = seatsDecision({
    seats: locked.seats,
    passengerIds: passengers.map((passenger) => passenger.personId),
    personIds,
    elsewhereIds: await seatedOnLeg(trx, eventId, leg),
  });
  if (!decision.ok) {
    return decision.error === "notEnoughSeats" && personIds.length === 1 ? { ok: false, error: "seatTaken" } : decision;
  }
  for (const personId of decision.place) await setPlacement(trx, { personId, eventId, leg, rideId });
  return { ok: true };
}

/**
 * Takes seats in a Ride for persons of the device (epic #66, R5 and R6), then reads the
 * event's state for it. Nothing for an unknown event; a malformed id is never looked up.
 *
 * On the connection, the write commits in its own transaction (READ COMMITTED, so that each
 * read after the Ride's lock sees what the take before it committed), and the state is read
 * after the commit, on one snapshot: readEventState refuses READ COMMITTED. Given a
 * transaction, both run in it, which must then be REPEATABLE READ. The token is only
 * compared, never logged nor kept.
 */
export async function takeSeats(
  db: Kysely<Database>,
  eventId: string,
  token: unknown,
  rideId: unknown,
  leg: unknown,
  personIds: unknown,
): Promise<TakeSeatsResult | undefined> {
  if (!isPublicId(eventId)) return undefined;
  const request = seatsRequest(rideId, leg, personIds);
  const outcome: SeatsOutcome = request
    ? await atomically(db, (trx) => placeInRide(trx, eventId, token, request))
    : { ok: false, error: "invalid" };
  const state = await readEventState(db, eventId, token);
  return state && { ...outcome, state };
}
