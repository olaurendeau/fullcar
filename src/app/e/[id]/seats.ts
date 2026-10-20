import type { Kysely } from "kysely";
import { lockPersons, readTokenHolders } from "@/db/persons";
import { dropPassengers, removePassengers, seatedOnLeg, setPlacement } from "@/db/placements";
import { lockRide, ridePassengers } from "@/db/rides";
import type { Database } from "@/db/schema";
import { atomically } from "@/db/transaction";
import { isCreationId } from "@/domain/creation-id";
import { devicePersonIds } from "@/domain/device";
import { LEGS, type Leg } from "@/domain/leg";
import { isPublicId } from "@/domain/public-id";
import { seatsDecision } from "@/domain/ride";
import { EVENT_NOT_FOUND, type EventNotFound } from "./change-ride";
import { readEventState, type EventState } from "./event-state";
import { lockLegs } from "./retour";

/**
 * - `noRetour`: the car is on the retour, and the event no longer has one (decision 40).
 * - `invalid`: a request no page sends (nobody asked, an id or a leg malformed).
 * - `forbidden`: someone asked is not a person of the device (C2.4).
 * - `rideGone`: the car is no longer offered on that leg (C6.8).
 * - `alreadyInCar`: someone asked is in another car on the leg, or drives on it (C5.6).
 * - `seatTaken`: one person asked, and the last seat was just taken (C5.7).
 * - `notEnoughSeats`: fewer seats left than persons asked, `freeSeats` of them (C6.5).
 */
export type SeatsOutcome =
  | { ok: true }
  | { ok: false; error: "noRetour" | "invalid" | "forbidden" | "rideGone" | "alreadyInCar" | "seatTaken" }
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

/** What the transaction gives: an unknown event has no state to give with its outcome. */
type Written<Outcome> = Outcome | EventNotFound;

/**
 * Under the Event's lock, the Ride's, then the persons' (lock order: Event, Ride, Person):
 * the seats are counted only once no other take can change them, and a person cannot
 * board two cars at once. All or nothing (D3); someone already in this car is placed
 * without a write (C5.8).
 */
async function placeInRide(
  trx: Kysely<Database>,
  eventId: string,
  token: unknown,
  { rideId, leg, personIds }: SeatsRequest,
): Promise<Written<SeatsOutcome>> {
  const legs = await lockLegs(trx, eventId, [leg]);
  if (!legs.ok) return legs;
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
 * event's state for it. `eventNotFound` for an unknown event, forged request or not; a
 * malformed id is never looked up.
 *
 * The application passes the connection: the write commits in its own transaction (READ
 * COMMITTED, so that each read after the Ride's lock sees what the take before it
 * committed), and the state is read after the commit, on one snapshot. A transaction passed
 * in is for tests only, and loses that guarantee (C12.11): readEventState needs it in
 * REPEATABLE READ, whose snapshot is taken before the Ride's lock, so a seat taken while it
 * waited is not counted, and the car is overbooked without an error. The token is only
 * compared, never logged nor kept.
 */
export async function takeSeats(
  db: Kysely<Database>,
  eventId: string,
  token: unknown,
  rideId: unknown,
  leg: unknown,
  personIds: unknown,
): Promise<TakeSeatsResult | EventNotFound> {
  if (!isPublicId(eventId)) return EVENT_NOT_FOUND;
  const request = seatsRequest(rideId, leg, personIds);
  const outcome: Written<SeatsOutcome> = request
    ? await atomically(db, (trx) => placeInRide(trx, eventId, token, request))
    : { ok: false, error: "invalid" };
  if (!outcome.ok && outcome.error === "eventNotFound") return EVENT_NOT_FOUND;
  const state = await readEventState(db, eventId, token);
  return state ? { ...outcome, state } : EVENT_NOT_FOUND;
}

/** Where a person stood on the leg before she took a seat, as the page showed it. */
const BEFORE = ["withoutCar", "notConcerned"] as const;
type Before = (typeof BEFORE)[number];

/**
 * - `undoneIds`: the persons given back their state before; nobody when the car is gone.
 * - `invalid`: a request no page sends (nobody asked, someone twice, an id, a leg or a state
 *   before malformed).
 * - `forbidden`: someone asked is not a person of the device (C7.3).
 * - `noRetour`: the car was on the retour, and the event no longer has one: nobody is
 *   left to give back, and the page says so (decision 45).
 */
export type UndoOutcome = { ok: true; undoneIds: string[] } | { ok: false; error: "noRetour" | "invalid" | "forbidden" };

/** The outcome, and the event's state as the device now sees it, refusal or not. */
export type UndoSeatsResult = UndoOutcome & { state: EventState };

interface UndoRequest {
  rideId: string;
  leg: Leg;
  persons: { personId: string; before: Before }[];
}

function undoEntry(entry: unknown): UndoRequest["persons"][number] | undefined {
  if (typeof entry !== "object" || entry === null) return undefined;
  const { personId, before } = entry as Record<string, unknown>;
  const known = BEFORE.find((state) => state === before);
  return isCreationId(personId) && known ? { personId, before: known } : undefined;
}

/** The request as a page sends it, or nothing: at least one person, each once, every field well-formed. */
function undoRequest(rideId: unknown, leg: unknown, persons: unknown): UndoRequest | undefined {
  if (!isCreationId(rideId) || !LEGS.some((known) => known === leg)) return undefined;
  if (!Array.isArray(persons) || persons.length === 0) return undefined;
  const entries = persons.map(undoEntry);
  if (!entries.every((entry) => entry !== undefined)) return undefined;
  if (new Set(entries.map((entry) => entry.personId)).size !== entries.length) return undefined;
  return { rideId, leg: leg as Leg, persons: entries };
}

/**
 * Under the Event's lock, the Ride's, then the persons' (lock order: Event, Ride, Person),
 * who is still in the Ride is read again: only they change, back without a car or with no
 * Placement on the leg (C5.10, as C7.4). All or nothing. Neither write fires a trigger of
 * C12.8: an update of `ride_id` alone and a delete are not among their events.
 */
async function giveBackSeats(
  trx: Kysely<Database>,
  eventId: string,
  token: unknown,
  { rideId, leg, persons }: UndoRequest,
): Promise<Written<UndoOutcome>> {
  const legs = await lockLegs(trx, eventId, [leg]);
  if (!legs.ok) return legs;
  const personIds = persons.map(({ personId }) => personId);
  const device = new Set(devicePersonIds(token, await readTokenHolders(trx, eventId)));
  if (!personIds.every((id) => device.has(id))) return { ok: false, error: "forbidden" };
  const ride = { id: rideId, eventId, leg };
  // Gone, its passengers are already without a car (`SET NULL`): nobody to give back.
  if ((await lockRide(trx, ride)) === undefined) return { ok: true, undoneIds: [] };
  await lockPersons(trx, eventId, personIds);
  const inRide = new Set((await ridePassengers(trx, ride)).map((passenger) => passenger.personId));
  const stillIn = (before: Before) =>
    persons.filter((person) => person.before === before && inRide.has(person.personId)).map((person) => person.personId);
  const undone = new Set([
    ...(await removePassengers(trx, ride, stillIn("withoutCar"))),
    ...(await dropPassengers(trx, ride, stillIn("notConcerned"))),
  ]);
  return { ok: true, undoneIds: personIds.filter((id) => undone.has(id)) };
}

/**
 * « Annuler » after a placement (C5.10): gives each person asked, of the device, her state
 * before on that leg, if she is still in that Ride, then reads the event's state for it.
 * `eventNotFound` for an unknown event, forged request or not; a malformed id is never
 * looked up. As for takeSeats, the write commits in its own transaction and the state is
 * read after the commit; the token is only compared, never logged nor kept.
 */
export async function undoSeats(
  db: Kysely<Database>,
  eventId: string,
  token: unknown,
  rideId: unknown,
  leg: unknown,
  persons: unknown,
): Promise<UndoSeatsResult | EventNotFound> {
  if (!isPublicId(eventId)) return EVENT_NOT_FOUND;
  const request = undoRequest(rideId, leg, persons);
  const outcome: Written<UndoOutcome> = request
    ? await atomically(db, (trx) => giveBackSeats(trx, eventId, token, request))
    : { ok: false, error: "invalid" };
  if (!outcome.ok && outcome.error === "eventNotFound") return EVENT_NOT_FOUND;
  const state = await readEventState(db, eventId, token);
  return state ? { ...outcome, state } : EVENT_NOT_FOUND;
}
