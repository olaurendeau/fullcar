import { sql, type Kysely } from "kysely";
import type { Leg } from "@/domain/leg";
import { lockRide, type RideRef } from "./rides";
import type { Database } from "./schema";
import { atomically } from "./transaction";

/** A person's Placement, as every query names it: by person, inside its event, on its leg. */
export interface PlacementRef {
  personId: string;
  eventId: string;
  leg: Leg;
}

export interface NewPlacement extends PlacementRef {
  /** `null`: without a car on the leg. */
  rideId: string | null;
}

/** The database's clock, the same for the whole transaction. */
const now = () => sql<Date>`now()`;

/**
 * Writes where the person stands on the leg: in that Ride, or without a car. The other
 * leg is not touched (C3.5). When `ride_id` changes, the boarding time goes back to
 * `now()`; written again with the same Ride, the row is left as it is. A person of
 * another event is left as she is too: the update is limited to `eventId`.
 *
 * In a car, the Ride is locked first (lock order: Ride, then Person, which the trigger on
 * placement locks), in the caller's transaction or in one opened here.
 */
export async function setPlacement(db: Kysely<Database>, placement: NewPlacement): Promise<void> {
  const { rideId } = placement;
  if (rideId === null) return upsertPlacement(db, placement);
  return atomically(db, async (trx) => {
    await lockRide(trx, { id: rideId, eventId: placement.eventId, leg: placement.leg });
    await upsertPlacement(trx, placement);
  });
}

async function upsertPlacement(db: Kysely<Database>, placement: NewPlacement): Promise<void> {
  await db
    .insertInto("placement")
    .values({
      person_id: placement.personId,
      event_id: placement.eventId,
      leg: placement.leg,
      ride_id: placement.rideId,
    })
    .onConflict((conflict) =>
      conflict
        .columns(["person_id", "leg"])
        .doUpdateSet((eb) => ({ ride_id: eb.ref("excluded.ride_id"), placed_at: now() }))
        .whereRef("placement.event_id", "=", "excluded.event_id")
        .whereRef("placement.ride_id", "is distinct from", "excluded.ride_id"),
    )
    .execute();
}

/** Whether the person had a Placement on the leg; she now has none there (not concerned). */
export async function deletePlacement(db: Kysely<Database>, placement: PlacementRef): Promise<boolean> {
  const result = await db
    .deleteFrom("placement")
    .where("person_id", "=", placement.personId)
    .where("event_id", "=", placement.eventId)
    .where("leg", "=", placement.leg)
    .executeTakeFirst();
  return Number(result.numDeletedRows) > 0;
}

/**
 * Leaves those of `personIds` who are in the Ride without a car on its leg, boarding time
 * `now()`, and returns their ids. The Ride is locked first, as for any write in a car; a
 * Ride unknown in that event and on that leg removes nobody.
 */
export async function removePassengers(
  db: Kysely<Database>,
  ride: RideRef,
  personIds: readonly string[],
): Promise<string[]> {
  if (personIds.length === 0) return [];
  return atomically(db, async (trx) => {
    if (!(await lockRide(trx, ride))) return [];
    const rows = await trx
      .updateTable("placement")
      .set({ ride_id: null, placed_at: now() })
      .where("ride_id", "=", ride.id)
      .where("event_id", "=", ride.eventId)
      .where("leg", "=", ride.leg)
      .where("person_id", "in", personIds)
      .returning("person_id")
      .execute();
    return rows.map((row) => row.person_id);
  });
}

/** On the leg, the persons in a car: the drivers of its Rides and their passengers. */
export async function seatedOnLeg(db: Kysely<Database>, eventId: string, leg: Leg): Promise<string[]> {
  const drivers = await db
    .selectFrom("ride")
    .select("driver_id")
    .where("event_id", "=", eventId)
    .where("leg", "=", leg)
    .execute();
  const passengers = await db
    .selectFrom("placement")
    .select("person_id")
    .where("event_id", "=", eventId)
    .where("leg", "=", leg)
    .where("ride_id", "is not", null)
    .execute();
  return [...drivers.map((row) => row.driver_id), ...passengers.map((row) => row.person_id)];
}

/** Where the person stands on the leg: in a Ride, without a car (`null`), or nothing (not concerned). */
export async function findPlacement(
  db: Kysely<Database>,
  placement: PlacementRef,
): Promise<{ rideId: string | null } | undefined> {
  const row = await db
    .selectFrom("placement")
    .select("ride_id")
    .where("person_id", "=", placement.personId)
    .where("event_id", "=", placement.eventId)
    .where("leg", "=", placement.leg)
    .executeTakeFirst();
  return row && { rideId: row.ride_id };
}
