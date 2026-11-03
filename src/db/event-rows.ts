import type { Kysely } from "kysely";
import type { BoardRows } from "@/domain/board";
import type { PhonesById } from "@/domain/phone-visibility";
import type { Position } from "@/domain/place";
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

/** The position stored with a place: both columns or neither (`ride_location_position_pair`). */
function storedPosition(lat: number | null, lng: number | null): Position | null {
  return lat === null || lng === null ? null : { lat, lng };
}

/**
 * Everything of one event's persons, Rides and Placements, both legs; nothing of another event.
 * The Stops, and the Stop where each Placement boards, are read only when `stops` is true, the
 * event's option (RV8.3): without it, `stops` is empty and every `stopId` is `null`, whatever
 * the tables hold.
 */
export async function readEventRows(
  db: Kysely<Database>,
  eventId: string,
  { stops: withStops }: { stops: boolean },
): Promise<EventRows> {
  const persons = await db
    .selectFrom("person")
    .select(PERSON_COLUMNS)
    .where("event_id", "=", eventId)
    .orderBy("created_at")
    .orderBy("id")
    .execute();
  const rides = await db
    .selectFrom("ride")
    .select(["id", "leg", "driver_id", "location", "departure_time", "seats", "note", "location_lat", "location_lng"])
    .where("event_id", "=", eventId)
    .orderBy("created_at")
    .orderBy("id")
    .execute();
  const placements = await db
    .selectFrom("placement")
    .select(["person_id", "leg", "ride_id", "placed_at"])
    .$if(withStops, (query) => query.select("stop_id"))
    .where("event_id", "=", eventId)
    .orderBy("placed_at")
    .orderBy("person_id")
    .orderBy("leg")
    .execute();
  const stops = withStops
    ? await db
        .selectFrom("stop")
        .select(["id", "ride_id", "location", "location_lat", "location_lng", "stop_time"])
        .where("event_id", "=", eventId)
        .where("leg", "=", "aller")
        .orderBy("stop_time")
        .orderBy("rank")
        .orderBy("id")
        .execute()
    : [];

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
      position: storedPosition(row.location_lat, row.location_lng),
    })),
    placements: placements.map((row) => ({
      personId: row.person_id,
      leg: row.leg,
      rideId: row.ride_id,
      stopId: row.stop_id ?? null,
      placedAt: row.placed_at,
    })),
    stops: stops.map((row) => ({
      id: row.id,
      rideId: row.ride_id,
      location: row.location,
      time: row.stop_time,
      position: storedPosition(row.location_lat, row.location_lng),
    })),
    phonesById: new Map(persons.map((row) => [row.id, row.phone])),
  };
}
