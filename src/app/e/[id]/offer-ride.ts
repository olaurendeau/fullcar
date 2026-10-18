import type { Kysely } from "kysely";
import { insertPerson, lockPersons, readTokenHolders } from "@/db/persons";
import { deletePlacement, findPlacement } from "@/db/placements";
import { findDrivenRide, insertRide, lockRide } from "@/db/rides";
import type { Database } from "@/db/schema";
import { atomically } from "@/db/transaction";
import { isCreationId } from "@/domain/creation-id";
import { devicePersonIds } from "@/domain/device";
import { eventLegs, LEGS, type Leg } from "@/domain/leg";
import { validatePerson, type NewPerson, type PersonErrors, type PersonField } from "@/domain/person";
import { isPersonalToken } from "@/domain/personal-token";
import { isPublicId } from "@/domain/public-id";
import { validateRide, type NewRide, type RideErrors, type RideField } from "@/domain/ride";
import { hashToken, tokenMatches } from "@/domain/token-hash";
import { findPublicEvent } from "./event";
import type { EventState } from "./event-state";

/**
 * What the form « Proposer une voiture » sends (R4), typed `unknown` since a forged request
 * can send anything. `rideId`, and the `personId` of a new driver, are creation ids drawn
 * by the browser (C4.10). The driver is either
 * - `{ kind: "device", personId }`: a person of the device, or
 * - `{ kind: "new", personId, firstName, phone }`: a new person, created with the token.
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
}

export type OfferField = PersonField | RideField;
export type OfferErrors = PersonErrors & RideErrors;

/**
 * - `eventNotFound`: no such event (or a malformed id, never looked up);
 * - `invalid`: what no form sends (an id or a leg malformed, a leg the event does
 *   not have, a new driver without a well-formed token);
 * - `forbidden`: the driver is not a person of this device;
 * - `alreadyDriving`: she drives another car on this leg (C4.6);
 * - `idTaken`: the Ride's id, or the new driver's, is held by someone else.
 */
export type OfferRefusal = "invalid" | "eventNotFound" | "forbidden" | "alreadyDriving" | "idTaken";

export type OfferRideResult =
  | { ok: true; rideId: string; driverId: string }
  | { ok: false; errors: OfferErrors; first: OfferField }
  | { ok: false; error: OfferRefusal };

/** What the action returns: the state read after the commit, or what `offerRide` refused. */
export type OfferRideOutcome = { ok: true; state: EventState } | Exclude<OfferRideResult, { ok: true }>;

type FieldErrors = Extract<OfferRideResult, { errors: OfferErrors }>;

type Driver =
  | { kind: "device"; personId: string }
  | { kind: "new"; personId: string; person: NewPerson; token: string };

interface Offer {
  rideId: string;
  leg: Leg;
  driver: Driver;
  ride: NewRide;
}

/** Thrown inside the transaction, so that what was written before it is rolled back. */
class Refused extends Error {
  constructor(readonly refusal: OfferRefusal) {
    super(`offerRide: refused (${refusal})`);
  }
}

/** The driver changed car between the read of her seat and the lock of her person. */
class DriverMoved extends Error {
  constructor() {
    super("offerRide: the driver changed car meanwhile");
  }
}

const EVENT_NOT_FOUND = { ok: false, error: "eventNotFound" } as const;
const INVALID = { ok: false, error: "invalid" } as const;

/** Attempts, on the connection, before a driver moving every time is a failure. */
const ATTEMPTS = 3;

function isLeg(value: unknown): value is Leg {
  return LEGS.some((leg) => leg === value);
}

function fieldsOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? { ...value } : undefined;
}

/**
 * The offer checked against the rules of R1 and R4, the driver's fields first, as in the
 * form. Nothing for what no form sends.
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

  const person = kind === "new" ? validatePerson({ firstName: driver.firstName, phone: driver.phone }) : undefined;
  const ride = validateRide({ location: offer.location, time: offer.time, seats: offer.seats, note: offer.note });
  if (person?.ok === false || !ride.ok) {
    // The driver's fields first: the first one in error gets the focus.
    const failures = [person, ride].flatMap((check) => (check?.ok === false ? [check] : []));
    const errors: OfferErrors = Object.assign({}, ...failures.map((failure) => failure.errors));
    return { ok: false, errors, first: failures[0].first };
  }
  return {
    rideId,
    leg,
    driver:
      newcomer && person?.ok ? { kind: "new", personId, person: person.person, token } : { kind: "device", personId },
    ride: ride.ride,
  };
}

/**
 * Proposes a car (R4), in one transaction:
 * 1. the driver: a person of the device, or a new person created with the token, who has
 *    no Placement, so she is not concerned by the other leg (C4.4);
 * 2. she leaves her seat, or the list of persons without a car, on this leg (C4.5);
 * 3. the Ride is inserted, on this leg only (C4.2).
 *
 * `eventNotFound` for an unknown event, forged request or not; a malformed id is never
 * looked up. Sent again, the same offer writes nothing more and succeeds (C4.10).
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
      // Rolled back: the next attempt reads her new seat, and locks it first.
      if (error instanceof DriverMoved && !db.isTransaction && attempt < ATTEMPTS) continue;
      throw error;
    }
  }
}

async function offerOnce(
  trx: Kysely<Database>,
  eventId: string,
  token: unknown,
  { rideId, leg, driver, ride }: Offer,
): Promise<OfferRideResult> {
  const event = await findPublicEvent(trx, eventId);
  if (event === undefined) throw new Refused("eventNotFound");
  if (!eventLegs(event.retour_at).includes(leg)) throw new Refused("invalid");

  const driverId = driver.personId;
  if (driver.kind === "new") {
    const tokenHash = hashToken(driver.token);
    const stored = await insertPerson(trx, { id: driverId, eventId, ...driver.person, tokenHash });
    if (stored === undefined || !tokenMatches(token, stored.tokenHash)) throw new Refused("idTaken");
  } else if (!devicePersonIds(token, await readTokenHolders(trx, eventId)).includes(driverId)) {
    throw new Refused("forbidden");
  }

  // Lock order: the Ride she sits in, then her Person, which the trigger on ride locks too.
  const placement = { personId: driverId, eventId, leg };
  const seat = (await findPlacement(trx, placement))?.rideId ?? null;
  if (seat !== null) await lockRide(trx, { id: seat, eventId, leg });
  await lockPersons(trx, eventId, [driverId]);
  // Her Person locked, only a write that holds her Ride can move her: locked if it was hers.
  const seatNow = (await findPlacement(trx, placement))?.rideId ?? null;
  if (seatNow !== null && seatNow !== seat) throw new DriverMoved();

  const driven = await findDrivenRide(trx, { driverId, eventId, leg });
  if (driven === rideId) return { ok: true, rideId, driverId };
  if (driven !== undefined) throw new Refused("alreadyDriving");

  await deletePlacement(trx, placement);
  const stored = await insertRide(trx, {
    id: rideId,
    eventId,
    leg,
    driverId,
    location: ride.location,
    departureTime: `${ride.time}:00`,
    seats: ride.seats,
    note: ride.note,
  });
  if (stored === undefined || stored.driverId !== driverId) throw new Refused("idTaken");
  return { ok: true, rideId, driverId };
}
