import type { Kysely } from "kysely";
import type { Leg } from "@/domain/leg";
import type { Database } from "./schema";

/** What a leg holds, as the confirmation of its removal shows it (decision 35). */
export interface LegCounts {
  /** Its Rides. */
  cars: number;
  /** The distinct persons who drive on it or have a Placement there, in a car or without one. */
  persons: number;
}

/** The leg's numbers in that event. */
export async function countLegRows(db: Kysely<Database>, eventId: string, leg: Leg): Promise<LegCounts> {
  const cars = await db
    .selectFrom("ride")
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .where("event_id", "=", eventId)
    .where("leg", "=", leg)
    .executeTakeFirstOrThrow();
  // `union` drops the duplicates: a person counts once.
  const onLeg = db
    .selectFrom("ride")
    .select("driver_id as person_id")
    .where("event_id", "=", eventId)
    .where("leg", "=", leg)
    .union(db.selectFrom("placement").select("person_id").where("event_id", "=", eventId).where("leg", "=", leg));
  const persons = await db
    .selectFrom(onLeg.as("on_leg"))
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .executeTakeFirstOrThrow();
  return { cars: Number(cars.n), persons: Number(persons.n) };
}

/**
 * Deletes the leg's Placements, then its Rides; the persons stay, with their other leg.
 * The Placements first: deleted after the Rides, they would be set without a car for
 * nothing (`SET NULL (ride_id)`).
 */
export async function deleteLegRows(db: Kysely<Database>, eventId: string, leg: Leg): Promise<void> {
  await db.deleteFrom("placement").where("event_id", "=", eventId).where("leg", "=", leg).execute();
  await db.deleteFrom("ride").where("event_id", "=", eventId).where("leg", "=", leg).execute();
}
