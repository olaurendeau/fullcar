import type { Kysely } from "kysely";
import type { BoardRows } from "@/domain/board";
import type { PhonesById } from "@/domain/phone-visibility";
import type { Database } from "./schema";

/**
 * The rows of one event, as the board reads them, and the persons' numbers apart: only
 * `withVisiblePhones` and `withOrganiserPhones` (src/domain/phone-visibility.ts) receive
 * `phonesById`, and set the numbers a device, or the organiser (DO1), may see. No row of
 * the board carries one.
 */
export interface EventRows extends BoardRows {
  phonesById: PhonesById;
}

/**
 * The columns of the only query that reads `phone` (docs/agents/architecture.md, "Visibilité
 * du téléphone"). Not exported: a `.select` of this list elsewhere would be a second read.
 */
const PERSON_COLUMNS = ["id", "first_name", "phone"] as const;

/** Everything of one event's persons, Rides and Placements, both legs; nothing of another event. */
export async function readEventRows(db: Kysely<Database>, eventId: string): Promise<EventRows> {
  const persons = await db
    .selectFrom("person")
    .select(PERSON_COLUMNS)
    .where("event_id", "=", eventId)
    .orderBy("created_at")
    .orderBy("id")
    .execute();
  const rides = await db
    .selectFrom("ride")
    .select(["id", "leg", "driver_id", "location", "departure_time", "seats", "note"])
    .where("event_id", "=", eventId)
    .orderBy("created_at")
    .orderBy("id")
    .execute();
  const placements = await db
    .selectFrom("placement")
    .select(["person_id", "leg", "ride_id", "placed_at"])
    .where("event_id", "=", eventId)
    .orderBy("placed_at")
    .orderBy("person_id")
    .orderBy("leg")
    .execute();

  return {
    persons: persons.map((row) => ({ id: row.id, firstName: row.first_name })),
    rides: rides.map((row) => ({
      id: row.id,
      leg: row.leg,
      driverId: row.driver_id,
      location: row.location,
      departureTime: row.departure_time,
      seats: row.seats,
      note: row.note,
    })),
    placements: placements.map((row) => ({
      personId: row.person_id,
      leg: row.leg,
      rideId: row.ride_id,
      placedAt: row.placed_at,
    })),
    phonesById: new Map(persons.map((row) => [row.id, row.phone])),
  };
}
