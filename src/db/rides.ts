import type { Kysely } from "kysely";
import type { Leg } from "@/domain/leg";
import type { WallTime } from "@/domain/wall-clock";
import type { Database } from "./schema";

/** A Ride as every query names it: by its id, inside its event, on its leg. */
export interface RideRef {
  id: string;
  eventId: string;
  leg: Leg;
}

export interface RideFields {
  location: string;
  /** `HH:MM:SS` on the date of the leg. */
  departureTime: WallTime;
  /** Passenger seats, driver excluded. */
  seats: number;
  note: string | null;
}

/** `id` is the creation id drawn by the browser. */
export interface NewRide extends RideRef, RideFields {
  driverId: string;
}

export type StoredRide = NewRide;

export interface LockedRide {
  id: string;
  driverId: string;
  seats: number;
}

export interface Passenger {
  personId: string;
  placedAt: Date;
}

const STORED_RIDE_COLUMNS = [
  "id",
  "event_id",
  "leg",
  "driver_id",
  "location",
  "departure_time",
  "seats",
  "note",
] as const;

/**
 * Stores the Ride, unless its id is taken: then nothing is written, and the Ride holding
 * the id is returned as it is, whatever its event or leg, for the caller to compare. It is
 * read by id alone: the creation id is what tells a resent creation apart. A second Ride
 * for the same driver and leg is refused by the database (`ride_driver_leg_unique`).
 */
export async function insertRide(db: Kysely<Database>, ride: NewRide): Promise<StoredRide> {
  await db
    .insertInto("ride")
    .values({
      id: ride.id,
      event_id: ride.eventId,
      leg: ride.leg,
      driver_id: ride.driverId,
      location: ride.location,
      departure_time: ride.departureTime,
      seats: ride.seats,
      note: ride.note,
    })
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute();
  const row = await db
    .selectFrom("ride")
    .select(STORED_RIDE_COLUMNS)
    .where("id", "=", ride.id)
    .executeTakeFirstOrThrow();
  return {
    id: row.id,
    eventId: row.event_id,
    leg: row.leg,
    driverId: row.driver_id,
    location: row.location,
    departureTime: row.departure_time,
    seats: row.seats,
    note: row.note,
  };
}

/**
 * `SELECT … FOR UPDATE` on the Ride, held until the transaction ends: the first step of
 * any write that counts its seats or places someone in it (lock order: Ride, then
 * Person). Nothing for an unknown Ride, or one of another event or leg. Outside a
 * transaction the lock ends with the statement: call it inside `atomically`.
 */
export async function lockRide(db: Kysely<Database>, ride: RideRef): Promise<LockedRide | undefined> {
  const row = await db
    .selectFrom("ride")
    .select(["id", "driver_id", "seats"])
    .where("id", "=", ride.id)
    .where("event_id", "=", ride.eventId)
    .where("leg", "=", ride.leg)
    .forUpdate()
    .executeTakeFirst();
  return row && { id: row.id, driverId: row.driver_id, seats: row.seats };
}

/** Whether that Ride existed on that leg, and now has these fields. */
export async function updateRide(db: Kysely<Database>, ride: RideRef, fields: RideFields): Promise<boolean> {
  const result = await db
    .updateTable("ride")
    .set({
      location: fields.location,
      departure_time: fields.departureTime,
      seats: fields.seats,
      note: fields.note,
    })
    .where("id", "=", ride.id)
    .where("event_id", "=", ride.eventId)
    .where("leg", "=", ride.leg)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

/**
 * Whether that Ride existed on that leg, and is now gone. Its passengers are left without
 * a car on the leg by the `placement → ride` key (`SET NULL (ride_id)`).
 */
export async function deleteRide(db: Kysely<Database>, ride: RideRef): Promise<boolean> {
  const result = await db
    .deleteFrom("ride")
    .where("id", "=", ride.id)
    .where("event_id", "=", ride.eventId)
    .where("leg", "=", ride.leg)
    .executeTakeFirst();
  return Number(result.numDeletedRows) > 0;
}

/** The Ride's passengers, driver excluded, in boarding order. */
export async function ridePassengers(db: Kysely<Database>, ride: RideRef): Promise<Passenger[]> {
  const rows = await db
    .selectFrom("placement")
    .select(["person_id", "placed_at"])
    .where("ride_id", "=", ride.id)
    .where("event_id", "=", ride.eventId)
    .where("leg", "=", ride.leg)
    .orderBy("placed_at")
    .orderBy("person_id")
    .execute();
  return rows.map((row) => ({ personId: row.person_id, placedAt: row.placed_at }));
}
