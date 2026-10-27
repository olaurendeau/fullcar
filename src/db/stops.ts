import type { Kysely } from "kysely";
import type { Position } from "@/domain/place";
import type { WallTime } from "@/domain/wall-clock";
import type { RideRef } from "./rides";
import type { Database } from "./schema";

/** A Stop of a Ride on the aller, as stored. */
export interface StoredStop {
  id: string;
  location: string;
  /** `HH:MM:SS` on the date of the aller. */
  time: WallTime;
  /** The point of the suggestion chosen for `location`; `null` for a place typed by hand. */
  position: Position | null;
  /** The place in the Ride, from 0 to 5: the order of entry among Stops at the same time. */
  rank: number;
}

/**
 * The Stops of the Ride, by time and then by rank (RV1.5). Nothing for a Ride unknown in that
 * event or on that leg, and nothing on the retour, which has none. Read only: the writes are
 * made under the Ride's lock, by the use cases.
 */
export async function rideStops(db: Kysely<Database>, ride: RideRef): Promise<StoredStop[]> {
  if (ride.leg !== "aller") return [];
  const rows = await db
    .selectFrom("stop")
    .select(["id", "location", "location_lat", "location_lng", "stop_time", "rank"])
    .where("ride_id", "=", ride.id)
    .where("event_id", "=", ride.eventId)
    .where("leg", "=", ride.leg)
    .orderBy("stop_time")
    .orderBy("rank")
    .execute();
  return rows.map((row) => ({
    id: row.id,
    location: row.location,
    time: row.stop_time,
    // The database keeps both or neither.
    position: row.location_lat === null || row.location_lng === null ? null : { lat: row.location_lat, lng: row.location_lng },
    rank: row.rank,
  }));
}

/** How many Rides of the event have at least one Stop. */
export async function countStopRides(db: Kysely<Database>, eventId: string): Promise<number> {
  const row = await db
    .selectFrom("stop")
    .select((eb) => eb.fn.count<string>("ride_id").distinct().as("n"))
    .where("event_id", "=", eventId)
    .executeTakeFirstOrThrow();
  return Number(row.n);
}
