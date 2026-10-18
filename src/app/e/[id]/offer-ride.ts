import type { Kysely } from "kysely";
import { insertPerson, lockPersons, readTokenHolders } from "@/db/persons";
import { deletePlacement, findPlacement, setPlacement, type PlacementRef } from "@/db/placements";
import { findDrivenRide, insertRide, lockRides, type RideRef } from "@/db/rides";
import type { Database } from "@/db/schema";
import { atomically } from "@/db/transaction";
import { isCreationId } from "@/domain/creation-id";
import { devicePersonIds } from "@/domain/device";
import { eventLegs, LEGS, otherLeg as otherLegOf, type Leg } from "@/domain/leg";
import { validatePerson, type NewPerson, type PersonErrors, type PersonField } from "@/domain/person";
import { isPersonalToken } from "@/domain/personal-token";
import { isPublicId } from "@/domain/public-id";
import { validateRide, type NewRide, type RideError, type RideErrors, type RideField } from "@/domain/ride";
import { hashToken, tokenMatches } from "@/domain/token-hash";
import { findPublicEvent } from "./event";
import type { EventState } from "./event-state";

/**
 * What the form « Proposer une voiture » sends (R4), typed `unknown` since a forged request
 * can send anything. `rideId`, and the `personId` of a new driver, are creation ids drawn
 * by the browser (C4.10). The driver is either
 * - `{ kind: "device", personId }`: a person of the device, or
 * - `{ kind: "new", personId, firstName, phone }`: a new person, created with the token.
 *
 * `otherLeg` is what becomes of the driver on the other leg, `keep` when absent (C4.11):
 * `{ kind: "keep" }`, `{ kind: "withoutCar" }`, `{ kind: "notConcerned" }`, or
 * `{ kind: "drive", rideId, location, time }`, a second car with this one's seats and note.
 */
export interface RideOffer {
  rideId?: unknown;
  leg?: unknown;
  driver?: unknown;
  location?: unknown;
  /** `HH:MM`, on the date of the leg. */
  time?: unknown;
  seats?: unknown;
  note?: unknown;
  otherLeg?: unknown;
}

/** The place and time of the car on the other leg, after this car's fields in the form. */
const OTHER_LEG_FIELDS = ["otherLocation", "otherTime"] as const;
type OtherLegField = (typeof OTHER_LEG_FIELDS)[number];

export type OfferField = PersonField | RideField | OtherLegField;
export type OfferErrors = PersonErrors & RideErrors & Partial<Record<OtherLegField, RideError>>;

/**
 * - `eventNotFound`: no such event (or a malformed id, never looked up);
 * - `invalid`: what no form sends (an id or a leg malformed, a leg the event does
 *   not have, a new driver without a well-formed token, another leg than `keep` on an
 *   event without a retour, one id for both cars);
 * - `forbidden`: the driver is not a person of this device;
 * - `alreadyDriving`: she drives another car on this leg, or drives on the other leg and
 *   the offer would change it (C4.6);
 * - `idTaken`: a Ride's id, or the new driver's, is held by someone else.
 */
export type OfferRefusal = "invalid" | "eventNotFound" | "forbidden" | "alreadyDriving" | "idTaken";

export type OfferRideResult =
  | { ok: true; rideId: string; driverId: string }
  | { ok: false; errors: OfferErrors; first: OfferField }
  | { ok: false; error: OfferRefusal };

type FieldErrors = Extract<OfferRideResult, { errors: OfferErrors }>;

/**
 * What the action returns: the state read after the commit, refusal included (C11.6, as
 * takeSeats); field errors and `eventNotFound` come without it.
 */
export type OfferRideOutcome =
  | { ok: true; state: EventState }
  | { ok: false; error: Exclude<OfferRefusal, "eventNotFound">; state: EventState }
  | FieldErrors
  | { ok: false; error: "eventNotFound" };

type Driver =
  | { kind: "device"; personId: string }
  | { kind: "new"; personId: string; person: NewPerson; token: string };

type OtherLeg = { kind: "keep" | "withoutCar" | "notConcerned" } | { kind: "drive"; rideId: string; ride: NewRide };

type OtherLegErrors = Partial<Record<OtherLegField, RideError>>;

/** The other leg as sent: its car, if the place and time are right, and their errors. */
type OtherLegRead =
  | { kind: "keep" | "withoutCar" | "notConcerned"; errors: OtherLegErrors }
  | { kind: "drive"; rideId: string; ride: NewRide | undefined; errors: OtherLegErrors };

interface Offer {
  rideId: string;
  leg: Leg;
  driver: Driver;
  ride: NewRide;
  otherLeg: OtherLeg;
}

/** Thrown inside the transaction, so that what was written before it is rolled back. */
class Refused extends Error {
  constructor(readonly refusal: OfferRefusal) {
    super(`offerRide: refused (${refusal})`);
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
  if (!isCreationId(rideId) || rideId === offer.rideId) return undefined;
  const ride = validateRide({ location: fields.location, time: fields.time, seats: offer.seats, note: offer.note });
  const errors: OtherLegErrors = {};
  if (!ride.ok && ride.errors.location) errors.otherLocation = ride.errors.location;
  if (!ride.ok && ride.errors.time) errors.otherTime = ride.errors.time;
  return { kind, rideId, ride: ride.ok ? ride.ride : undefined, errors };
}

/**
 * The offer checked against the rules of R1 and R4, in the order of the form: the
 * driver's fields, this car's, then the other leg's. Nothing for what no form sends.
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
  if (other === undefined) return undefined;

  const person = kind === "new" ? validatePerson({ firstName: driver.firstName, phone: driver.phone }) : undefined;
  const ride = validateRide({ location: offer.location, time: offer.time, seats: offer.seats, note: offer.note });
  const otherFirst = OTHER_LEG_FIELDS.find((field) => other.errors[field] !== undefined);
  if (person?.ok === false || !ride.ok || otherFirst !== undefined) {
    // In the order of the form: the first one in error gets the focus.
    const failures = [person, ride].flatMap((check) => (check?.ok === false ? [check] : []));
    const errors: OfferErrors = Object.assign({}, ...failures.map((failure) => failure.errors), other.errors);
    return { ok: false, errors, first: failures[0]?.first ?? otherFirst ?? "otherLocation" };
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
    ride: ride.ride,
    otherLeg,
  };
}

/**
 * Proposes a car (R4), in one transaction, all or nothing (C4.5):
 * 1. the driver: a person of the device, or a new person created with the token, who has
 *    no Placement, so she is not concerned by the other leg (C4.4);
 * 2. she leaves her seat, or the list of persons without a car, on this leg (C4.5);
 * 3. on the other leg, as `otherLeg` says: unchanged, without a car, not concerned, or
 *    driving a second car with the same seats and note (C4.2, C4.11), leaving her seat
 *    there unless she keeps it (C4.12);
 * 4. the Ride is inserted on this leg.
 *
 * A malformed id is refused as `eventNotFound` before anything, field errors included, and
 * never looked up. A well-formed offer with field errors gets them, on an unknown event
 * too, as updateRide does; what no form sends is `invalid` for a known event, and
 * `eventNotFound` for an unknown one. Sent again, the same offer writes nothing more and
 * succeeds (C4.10).
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
      if (error instanceof Refused) return { ok: false, error: error.refusal };
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

async function storeRide(trx: Kysely<Database>, ref: RideRef, driverId: string, ride: NewRide): Promise<void> {
  const { location, seats, note } = ride;
  const stored = await insertRide(trx, { ...ref, driverId, location, departureTime: `${ride.time}:00`, seats, note });
  if (stored === undefined || stored.driverId !== driverId) throw new Refused("idTaken");
}

async function offerOnce(
  trx: Kysely<Database>,
  eventId: string,
  token: unknown,
  { rideId, leg, driver, ride, otherLeg }: Offer,
): Promise<OfferRideResult> {
  const event = await findPublicEvent(trx, eventId);
  if (event === undefined) throw new Refused("eventNotFound");
  const legs = eventLegs(event.retour_at);
  const other = otherLegOf(leg);
  if (!legs.includes(leg) || (otherLeg.kind !== "keep" && !legs.includes(other))) throw new Refused("invalid");

  const driverId = driver.personId;
  if (driver.kind === "new") {
    const tokenHash = hashToken(driver.token);
    const stored = await insertPerson(trx, { id: driverId, eventId, ...driver.person, tokenHash });
    if (stored === undefined || !tokenMatches(token, stored.tokenHash)) throw new Refused("idTaken");
  } else if (!devicePersonIds(token, await readTokenHolders(trx, eventId)).includes(driverId)) {
    throw new Refused("forbidden");
  }

  // The Placements she leaves: on this leg, and on the other unless she keeps it.
  const here = { personId: driverId, eventId, leg };
  const there = { personId: driverId, eventId, leg: other };
  const leaving = otherLeg.kind === "keep" ? [here] : [here, there];
  // Lock order: the Rides she sits in, by ascending id, then her Person, which the triggers
  // on ride lock too. By leg, two offers leaving the same two Rides in reverse roles would
  // each hold one and wait for the other.
  const seats = await seatsOf(trx, leaving);
  await lockRides(
    trx,
    leaving.flatMap((placement, at) => {
      const id = seats[at];
      return id === null ? [] : [{ id, eventId, leg: placement.leg }];
    }),
  );
  await lockPersons(trx, eventId, [driverId]);
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

  // Her Placements before the Rides she drives: the trigger of C12.8 refuses a Ride whose
  // driver is still placed on its leg.
  await deletePlacement(trx, here);
  if (otherLeg.kind === "withoutCar") await setPlacement(trx, { ...there, rideId: null });
  if (otherLeg.kind === "notConcerned" || otherLeg.kind === "drive") await deletePlacement(trx, there);
  if (otherLeg.kind === "drive") await storeRide(trx, { id: otherLeg.rideId, eventId, leg: other }, driverId, otherLeg.ride);
  await storeRide(trx, { id: rideId, eventId, leg }, driverId, ride);
  return { ok: true, rideId, driverId };
}
