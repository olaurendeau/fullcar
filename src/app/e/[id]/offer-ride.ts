import type { Kysely } from "kysely";
import { insertPerson, lockPersons, readTokenHolders } from "@/db/persons";
import { deletePlacement, findPlacement, seatedOnLeg, setPlacement, type PlacementRef } from "@/db/placements";
import { findDrivenRide, insertRide, lockRides, type RideRef } from "@/db/rides";
import type { Database } from "@/db/schema";
import { atomically } from "@/db/transaction";
import { isCreationId } from "@/domain/creation-id";
import { deviceAccess } from "@/domain/device";
import { LEGS, otherLeg as otherLegOf, type Leg } from "@/domain/leg";
import { validatePerson, type NewPerson, type PersonErrors, type PersonField } from "@/domain/person";
import { isPersonalToken } from "@/domain/personal-token";
import { positionOf, type Position } from "@/domain/place";
import { isPublicId } from "@/domain/public-id";
import {
  passengersFit,
  seatsDecision,
  validateRide,
  validSeats,
  type NewRide,
  type RideError,
  type RideErrors,
  type RideField,
} from "@/domain/ride";
import { hashToken, tokenMatches } from "@/domain/token-hash";
import { findPublicEvent } from "./event";
import type { EventState } from "./event-state";
import { lockLegs } from "./retour";

/**
 * What the form « Proposer une voiture » sends (R4), typed `unknown` since a forged request
 * can send anything. `rideId`, and the `personId` of a new driver, are creation ids drawn
 * by the browser (C4.10). The driver is either
 * - `{ kind: "device", personId }`: a person of the device, or
 * - `{ kind: "new", personId, firstName, phone }`: a new person, created with the token.
 *
 * `otherLeg` is what becomes of the driver on the other leg, `keep` when absent (C4.11):
 * `{ kind: "keep" }`, `{ kind: "withoutCar" }`, `{ kind: "notConcerned" }`, or
 * `{ kind: "drive", rideId, location, position, time }`, a second car with this one's seats
 * and note.
 *
 * `position` is the point of the suggestion chosen for `location`, `null` when absent: sent
 * without its place, or not a position, the offer is `invalid` (AL6.4).
 *
 * `passengerIds` are those ticked in « Qui monte avec vous ? » (C4.13), none when absent:
 * persons of the device, each once, not the driver, at most as many as the seats.
 */
export interface RideOffer {
  rideId?: unknown;
  leg?: unknown;
  driver?: unknown;
  location?: unknown;
  position?: unknown;
  /** `HH:MM`, on the date of the leg. */
  time?: unknown;
  seats?: unknown;
  note?: unknown;
  otherLeg?: unknown;
  passengerIds?: unknown;
}

/** The place and time of the car on the other leg, after this car's fields in the form. */
const OTHER_LEG_FIELDS = ["otherLocation", "otherTime"] as const;
type OtherLegField = (typeof OTHER_LEG_FIELDS)[number];

/** More ticked in « Qui monte avec vous ? » than the car has seats: the last field of the form. */
type PassengersErrors = { passengers?: "tooMany" };

export type OfferField = PersonField | RideField | OtherLegField | "passengers";
export type OfferErrors = PersonErrors & RideErrors & Partial<Record<OtherLegField, RideError>> & PassengersErrors;

/**
 * - `eventNotFound`: no such event (or a malformed id, never looked up);
 * - `eventEnded`: the event is anonymised (#588), before any other refusal;
 * - `noRetour`: the car, or the driver's choice on the other leg (`withoutCar`, `drive`),
 *   is on a retour the event no longer has (decision 40), before any other refusal;
 * - `invalid`: what no form sends (an id or a leg malformed, a new driver without a
 *   well-formed token, one id for both cars, a passenger ticked twice, the driver ticked);
 * - `forbidden`: the driver, or a passenger, is not a person of this device;
 * - `personGone`: with a well-formed token, the driver of the device, or a passenger, is no
 *   longer a person of the event, removed since the page showed her (RP5.4): `goneIds`;
 * - `alreadyDriving`: she drives another car on this leg, or drives on the other leg and
 *   the offer would change it (C4.6);
 * - `alreadyInCar`: a passenger is in another car on this leg, or drives on it (C4.13);
 * - `idTaken`: a Ride's id, or the new driver's, is held by someone else.
 */
export type OfferRefusal =
  | "noRetour"
  | "invalid"
  | "eventNotFound"
  | "eventEnded"
  | "forbidden"
  | "personGone"
  | "alreadyDriving"
  | "alreadyInCar"
  | "idTaken";

/** Who is gone from the event among those an offer named. */
type PersonGone = { ok: false; error: "personGone"; goneIds: string[] };

export type OfferRideResult =
  | { ok: true; rideId: string; driverId: string }
  | { ok: false; errors: OfferErrors; first: OfferField }
  | { ok: false; error: Exclude<OfferRefusal, "personGone"> }
  | PersonGone;

type FieldErrors = Extract<OfferRideResult, { errors: OfferErrors }>;

/**
 * What the action returns: the state read after the commit, refusal included (C11.6, as
 * takeSeats); field errors and `eventNotFound` come without it.
 */
export type OfferRideOutcome =
  | { ok: true; state: EventState }
  | { ok: false; error: Exclude<OfferRefusal, "eventNotFound" | "personGone">; state: EventState }
  | (PersonGone & { state: EventState })
  | FieldErrors
  | { ok: false; error: "eventNotFound" };

type Driver =
  | { kind: "device"; personId: string }
  | { kind: "new"; personId: string; person: NewPerson; token: string };

/** A car's fields, and the position of its place (AL4.3). */
type PlacedRide = NewRide & { position: Position | null };

type OtherLeg = { kind: "keep" | "withoutCar" | "notConcerned" } | { kind: "drive"; rideId: string; ride: PlacedRide };

type OtherLegErrors = Partial<Record<OtherLegField, RideError>>;

/** The other leg as sent: its car, if the place and time are right, and their errors. */
type OtherLegRead =
  | { kind: "keep" | "withoutCar" | "notConcerned"; errors: OtherLegErrors }
  | { kind: "drive"; rideId: string; ride: PlacedRide | undefined; errors: OtherLegErrors };

interface Offer {
  rideId: string;
  leg: Leg;
  driver: Driver;
  ride: PlacedRide;
  otherLeg: OtherLeg;
  passengerIds: string[];
}

/** Thrown inside the transaction, so that what was written before it is rolled back. */
class Refused extends Error {
  /** `goneIds` for `personGone`: those of the offer no longer persons of the event. */
  constructor(
    readonly refusal: OfferRefusal,
    readonly goneIds: string[] = [],
  ) {
    super(`offerRide: refused (${refusal})`);
  }

  get result(): OfferRideResult {
    const { refusal, goneIds } = this;
    return refusal === "personGone" ? { ok: false, error: refusal, goneIds } : { ok: false, error: refusal };
  }
}

/** The driver changed car between the read of her seats and the lock of her person. */
class DriverMoved extends Error {
  constructor() {
    super("offerRide: the driver changed car meanwhile");
  }
}

const EVENT_NOT_FOUND = { ok: false, error: "eventNotFound" } as const;
const INVALID = { ok: false, error: "invalid" } as const;

/** Attempts, on the connection, before a driver moving every time is a failure. */
const ATTEMPTS = 3;

const OTHER_LEG_KINDS = ["keep", "withoutCar", "notConcerned", "drive"] as const;

function isLeg(value: unknown): value is Leg {
  return LEGS.some((leg) => leg === value);
}

function fieldsOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? { ...value } : undefined;
}

/** The position of a place, `null` when absent; nothing when sent without its place, or malformed. */
function placePosition(location: unknown, position: unknown): Position | null | undefined {
  if (position === undefined) return null;
  const read = location === undefined ? undefined : positionOf(position);
  return read && "value" in read ? read.value : undefined;
}

/**
 * The other leg as sent, `keep` when absent. A car there has its own id, and its place and
 * time checked by R4 with this car's seats and note, whose errors are this car's: `errors`
 * holds its place's and time's only. Nothing for what no form sends.
 */
function readOtherLeg(offer: Record<string, unknown>): OtherLegRead | undefined {
  if (offer.otherLeg === undefined) return { kind: "keep", errors: {} };
  const fields = fieldsOf(offer.otherLeg);
  const kind = OTHER_LEG_KINDS.find((known) => known === fields?.kind);
  if (fields === undefined || kind === undefined) return undefined;
  if (kind !== "drive") return { kind, errors: {} };
  const { rideId } = fields;
  const position = placePosition(fields.location, fields.position);
  if (!isCreationId(rideId) || rideId === offer.rideId || position === undefined) return undefined;
  const ride = validateRide({ location: fields.location, time: fields.time, seats: offer.seats, note: offer.note });
  const errors: OtherLegErrors = {};
  if (!ride.ok && ride.errors.location) errors.otherLocation = ride.errors.location;
  if (!ride.ok && ride.errors.time) errors.otherTime = ride.errors.time;
  return { kind, rideId, ride: ride.ok ? { ...ride.ride, position } : undefined, errors };
}

/** Those ticked, none when absent; nothing for a list no form sends. */
function readPassengers(value: unknown, driverId: string): string[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every(isCreationId)) return undefined;
  const ids: string[] = value;
  if (new Set(ids).size !== ids.length || ids.includes(driverId)) return undefined;
  return ids;
}

/**
 * The offer checked against the rules of R1 and R4, in the order of the form: the
 * driver's fields, this car's, the other leg's, then the passengers (C4.13), counted
 * against the seats whenever these are right. Nothing for what no form sends.
 */
function readOffer(input: unknown, token: unknown): Offer | FieldErrors | undefined {
  const offer = fieldsOf(input);
  const driver = fieldsOf(offer?.driver);
  if (offer === undefined || driver === undefined) return undefined;
  const { rideId, leg } = offer;
  const { kind, personId } = driver;
  if (!isCreationId(rideId) || !isLeg(leg) || !isCreationId(personId)) return undefined;
  const newcomer = kind === "new" && isPersonalToken(token);
  if (kind !== "device" && !newcomer) return undefined;
  const other = readOtherLeg(offer);
  const passengerIds = readPassengers(offer.passengerIds, personId);
  const position = placePosition(offer.location, offer.position);
  if (other === undefined || passengerIds === undefined || position === undefined) return undefined;

  const person = kind === "new" ? validatePerson({ firstName: driver.firstName, phone: driver.phone }) : undefined;
  const ride = validateRide({ location: offer.location, time: offer.time, seats: offer.seats, note: offer.note });
  const seats = validSeats(offer.seats);
  const passengers: PassengersErrors =
    seats !== undefined && !passengersFit(passengerIds.length, seats) ? { passengers: "tooMany" } : {};
  const lastFirst =
    OTHER_LEG_FIELDS.find((field) => other.errors[field] !== undefined) ??
    (passengers.passengers ? "passengers" : undefined);
  if (person?.ok === false || !ride.ok || lastFirst !== undefined) {
    // In the order of the form: the first one in error gets the focus.
    const failures = [person, ride].flatMap((check) => (check?.ok === false ? [check] : []));
    const errors: OfferErrors = Object.assign({}, ...failures.map((failure) => failure.errors), other.errors, passengers);
    return { ok: false, errors, first: failures[0]?.first ?? lastFirst ?? "otherLocation" };
  }
  // This car's seats and note checked, and the other's place and time: so is the other car.
  const otherLeg: OtherLeg | undefined =
    other.kind !== "drive" ? { kind: other.kind } : other.ride && { kind: "drive", rideId: other.rideId, ride: other.ride };
  if (otherLeg === undefined) return undefined;
  return {
    rideId,
    leg,
    driver:
      newcomer && person?.ok ? { kind: "new", personId, person: person.person, token } : { kind: "device", personId },
    ride: { ...ride.ride, position },
    otherLeg,
    passengerIds,
  };
}

/**
 * Proposes a car (R4), in one transaction, all or nothing (C4.5):
 * 1. the driver: a person of the device, or a new person created with the token, who has
 *    no Placement, so she is not concerned by the other leg (C4.4);
 * 2. she leaves her seat, or the list of persons without a car, on this leg (C4.5);
 * 3. on the other leg, as `otherLeg` says: unchanged, without a car, not concerned, or
 *    driving a second car with the same seats and note (C4.2, C4.11), leaving her seat
 *    there unless she keeps it (C4.12). Not concerned by a retour the event does not
 *    have, she is already: the aller is written alone;
 * 4. the Ride is inserted on this leg;
 * 5. those ticked board it, on this leg only, unless one of them is in another car or
 *    drives there (C4.13); one not concerned by the leg is placed too, as in the sheet.
 *
 * A malformed id is refused as `eventNotFound` before anything, field errors included, and
 * never looked up. A well-formed offer with field errors gets them, on an unknown event
 * too, as updateRide does; what no form sends is `invalid` for a known event, and
 * `eventNotFound` for an unknown one. Sent again, the same offer writes nothing more and
 * succeeds (C4.10): no passenger is placed twice, nor again once she left.
 *
 * The application passes the connection: a refusal after a write throws inside the
 * transaction `atomically` opens, which rolls it back, and that transaction is READ
 * COMMITTED, where the triggers of C12.8 see a write committed while they wait; the state
 * of the event is read after the commit, never inside it. A transaction passed in is for
 * tests only, and loses those guarantees: a refusal after a write returns without undoing
 * it, for the caller to roll back; a driver who moved is not tried again; and in
 * REPEATABLE READ, the reads after the lock of her Person keep the snapshot taken before
 * it, so a seat she took while it waited is not seen (C12.8). The token is only hashed
 * and compared, never logged nor kept.
 */
export async function offerRide(
  db: Kysely<Database>,
  eventId: string,
  token: unknown,
  input: unknown,
): Promise<OfferRideResult> {
  if (!isPublicId(eventId)) return EVENT_NOT_FOUND;
  const offer = readOffer(input, token);
  // What no form sends: invalid for a known event, as for the other writes.
  if (offer === undefined) return (await findPublicEvent(db, eventId)) ? INVALID : EVENT_NOT_FOUND;
  if (!("rideId" in offer)) return offer;
  for (let attempt = 1; ; attempt++) {
    try {
      // Given a transaction (tests only), a refusal leaves what was written in it.
      return await atomically(db, (trx) => offerOnce(trx, eventId, token, offer));
    } catch (error) {
      if (error instanceof Refused) return error.result;
      // Rolled back: the next attempt reads her new seats, and locks them first.
      if (error instanceof DriverMoved && !db.isTransaction && attempt < ATTEMPTS) continue;
      throw error;
    }
  }
}

/** The Ride each Placement is in; `null` without a car or without a Placement. */
async function seatsOf(trx: Kysely<Database>, placements: readonly PlacementRef[]): Promise<(string | null)[]> {
  return Promise.all(placements.map(async (placement) => (await findPlacement(trx, placement))?.rideId ?? null));
}

async function storeRide(trx: Kysely<Database>, ref: RideRef, driverId: string, ride: PlacedRide): Promise<void> {
  const { location, position, seats, note } = ride;
  const departureTime = `${ride.time}:00`;
  const stored = await insertRide(trx, { ...ref, driverId, location, position, departureTime, seats, note });
  if (stored === undefined || stored.driverId !== driverId) throw new Refused("idTaken");
}

async function offerOnce(
  trx: Kysely<Database>,
  eventId: string,
  token: unknown,
  { rideId, leg, driver, ride, otherLeg: sent, passengerIds }: Offer,
): Promise<OfferRideResult> {
  // Lock order: the Event first, shared, then the Rides, then the Persons.
  const other = otherLegOf(leg);
  const writesOther = sent.kind === "withoutCar" || sent.kind === "drive";
  const locked = await lockLegs(trx, eventId, writesOther ? [leg, other] : [leg]);
  if (!locked.ok) throw new Refused(locked.error);
  const otherLeg: OtherLeg = locked.legs.includes(other) ? sent : { kind: "keep" };

  const driverId = driver.personId;
  // Before any write, so that a transaction passed in is left as it was. A person of another
  // device comes before one gone from the event (RP5.4).
  const named = driver.kind === "device" ? [driverId, ...passengerIds] : passengerIds;
  const access = deviceAccess(token, await readTokenHolders(trx, eventId), named);
  if (access.kind === "forbidden") throw new Refused("forbidden");
  if (access.kind === "personGone") throw new Refused("personGone", access.goneIds);
  if (driver.kind === "new") {
    const tokenHash = hashToken(driver.token);
    const stored = await insertPerson(trx, { id: driverId, eventId, ...driver.person, tokenHash });
    if (stored === undefined || !tokenMatches(token, stored.tokenHash)) throw new Refused("idTaken");
  }

  // The Placements she leaves: on this leg, and on the other unless she keeps it.
  const here = { personId: driverId, eventId, leg };
  const there = { personId: driverId, eventId, leg: other };
  const leaving = otherLeg.kind === "keep" ? [here] : [here, there];
  // Lock order: the Rides she sits in, by ascending id, then her Person and her passengers',
  // by ascending id, which the triggers on ride and placement lock too. By leg, two offers
  // leaving the same two Rides in reverse roles would each hold one and wait for the other.
  const seats = await seatsOf(trx, leaving);
  await lockRides(
    trx,
    leaving.flatMap((placement, at) => {
      const id = seats[at];
      return id === null ? [] : [{ id, eventId, leg: placement.leg }];
    }),
  );
  // Removed after the read, while this waited for her Person: no car for a driver, nor a seat for
  // a passenger, who is no longer there (RP5.4).
  const present = new Set(await lockPersons(trx, eventId, [driverId, ...passengerIds]));
  const goneIds = [driverId, ...passengerIds].filter((id) => !present.has(id));
  if (goneIds.length > 0) throw new Refused("personGone", goneIds);
  // Her Person locked, only a write that holds her Ride can move her: locked if it was hers.
  const seatsNow = await seatsOf(trx, leaving);
  if (seatsNow.some((seat, at) => seat !== null && seat !== seats[at])) throw new DriverMoved();

  // Sent again: the whole offer was written with this car (all or nothing), so nothing is.
  const driven = await findDrivenRide(trx, { driverId, eventId, leg });
  if (driven === rideId) return { ok: true, rideId, driverId };
  if (driven !== undefined) throw new Refused("alreadyDriving");
  if (otherLeg.kind !== "keep" && (await findDrivenRide(trx, { driverId, eventId, leg: other })) !== undefined) {
    throw new Refused("alreadyDriving");
  }
  // Their Persons locked, no other write can seat them on this leg meanwhile. The new car
  // is empty, and passengersFit counted them against its seats: none is short.
  const boarding = seatsDecision({
    seats: ride.seats,
    passengerIds: [],
    personIds: passengerIds,
    elsewhereIds: await seatedOnLeg(trx, eventId, leg),
  });
  if (!boarding.ok) throw new Refused(boarding.error === "alreadyInCar" ? "alreadyInCar" : "invalid");

  // Her Placements before the Rides she drives: the trigger of C12.8 refuses a Ride whose
  // driver is still placed on its leg.
  await deletePlacement(trx, here);
  if (otherLeg.kind === "withoutCar") await setPlacement(trx, { ...there, rideId: null });
  if (otherLeg.kind === "notConcerned" || otherLeg.kind === "drive") await deletePlacement(trx, there);
  if (otherLeg.kind === "drive") await storeRide(trx, { id: otherLeg.rideId, eventId, leg: other }, driverId, otherLeg.ride);
  await storeRide(trx, { id: rideId, eventId, leg }, driverId, ride);
  for (const personId of boarding.place) await setPlacement(trx, { personId, eventId, leg, rideId });
  return { ok: true, rideId, driverId };
}
