import { randomBytes, randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Leg } from "@/domain/leg";
import { PERSONAL_TOKEN_BYTES, personalTokenFromBytes } from "@/domain/personal-token";
import { hashToken } from "@/domain/token-hash";
import type { Position } from "@/domain/place";
import type { WallTime } from "@/domain/wall-clock";
import { insertPerson, type NewPerson } from "./persons";
import { setPlacement, type NewPlacement } from "./placements";
import { insertRide, type RideFields } from "./rides";
import type { Database } from "./schema";

export interface SeededPerson {
  id: string;
  /** The personal token, for tests only: the database keeps its hash. */
  token: string;
}

/**
 * Stores a person of the event, « Léa » without a number unless `fields` says otherwise,
 * with a new id, and a new personal token unless the test gives one (to seed two persons
 * of the same device). For Vitest and the Playwright fixtures.
 */
export async function seedPerson(
  db: Kysely<Database>,
  eventId: string,
  fields: Partial<Pick<NewPerson, "id" | "firstName" | "phone">> = {},
  token: string = personalTokenFromBytes(randomBytes(PERSONAL_TOKEN_BYTES)),
): Promise<SeededPerson> {
  const person = await insertPerson(db, {
    id: randomUUID(),
    firstName: "Léa",
    phone: null,
    ...fields,
    eventId,
    tokenHash: hashToken(token),
  });
  if (!person) throw new Error("seedPerson: the id is taken by another event");
  return { id: person.id, token };
}

/**
 * Stores a Ride driven by `driverId`, on the aller with 3 seats and no position unless
 * `fields` says otherwise.
 */
export async function seedRide(
  db: Kysely<Database>,
  eventId: string,
  driverId: string,
  fields: Partial<RideFields & { id: string; leg: Leg }> = {},
): Promise<string> {
  const ride = await insertRide(db, {
    id: randomUUID(),
    leg: "aller",
    location: "Mairie de Cesson",
    departureTime: "07:15:00",
    seats: 3,
    note: null,
    position: null,
    ...fields,
    eventId,
    driverId,
  });
  if (!ride) throw new Error("seedRide: the id is taken by another event or leg");
  return ride.id;
}

export interface SeededStop {
  id: string;
  location: string;
  /** `HH:MM:SS` on the date of the aller. */
  time: WallTime;
  position: Position | null;
  /** From 0 to 5; the next free one in the Ride unless the test gives one. */
  rank: number;
}

/**
 * Stores a Stop of an aller Ride, "Mairie de Pacé" at 07:30 without a position unless `fields`
 * says otherwise, with a new id (drawn like a Ride's) and the next free rank in the Ride. The
 * row is written as it is, without the domain's rules: a test of the rules writes its own.
 * For Vitest and the Playwright fixtures.
 */
export async function seedStop(
  db: Kysely<Database>,
  eventId: string,
  rideId: string,
  fields: Partial<SeededStop> = {},
): Promise<string> {
  const rank =
    fields.rank ??
    Number(
      (
        await db
          .selectFrom("stop")
          .select((eb) => eb.fn.countAll<string>().as("n"))
          .where("ride_id", "=", rideId)
          .executeTakeFirstOrThrow()
      ).n,
    );
  const stop = { id: randomUUID(), location: "Mairie de Pacé", time: "07:30:00", position: null, ...fields };
  await db
    .insertInto("stop")
    .values({
      id: stop.id,
      event_id: eventId,
      ride_id: rideId,
      leg: "aller",
      location: stop.location,
      location_lat: stop.position?.lat ?? null,
      location_lng: stop.position?.lng ?? null,
      stop_time: stop.time,
      rank,
    })
    .execute();
  return stop.id;
}

/** Places a person on a leg: in a Ride, or without a car when `rideId` is null. */
export async function seedPlacement(db: Kysely<Database>, placement: NewPlacement): Promise<void> {
  await setPlacement(db, placement);
}

/**
 * Deletes a person of the event, her Rides and Placements going with her by cascade: a person
 * removed from the event (#645) as another device would, for Vitest and the Playwright fixtures.
 */
export async function deleteSeededPerson(db: Kysely<Database>, eventId: string, personId: string): Promise<void> {
  await db.deleteFrom("person").where("id", "=", personId).where("event_id", "=", eventId).execute();
}
