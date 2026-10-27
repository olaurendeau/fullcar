import type { Kysely } from "kysely";
import type { Position } from "@/domain/place";
import type { ValidStop } from "@/domain/stop";
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

/** The columns of a Stop as a Ride's lock lets them be written; `rank` is its index in the list. */
function stopColumns(stop: ValidStop, rank: number) {
  return {
    location: stop.location,
    location_lat: stop.position?.lat ?? null,
    location_lng: stop.position?.lng ?? null,
    stop_time: `${stop.time}:00`,
    rank,
  };
}

/**
 * The Stops of a Ride just inserted, `rank` being their index in `stops`, which come in the
 * order of their time (`validateStops`). Under the Ride's lock, which the insert of the Ride
 * holds. `false` when an id is already a Stop, of this Ride or another, and then some may
 * have been written: the caller rolls back.
 */
export async function insertStops(db: Kysely<Database>, ride: RideRef, stops: readonly ValidStop[]): Promise<boolean> {
  if (stops.length === 0) return true;
  const inserted = await db
    .insertInto("stop")
    .values(stops.map((stop, rank) => ({ id: stop.id, event_id: ride.eventId, ride_id: ride.id, leg: "aller" as const, ...stopColumns(stop, rank) })))
    .onConflict((conflict) => conflict.column("id").doNothing())
    .returning("id")
    .execute();
  return inserted.length === stops.length;
}

/**
 * The Ride's Stops become `stops`, the complete list in the order of their time (RV6.1 to
 * RV6.3), in one transaction, under the Ride's lock (`lockRide`):
 * - one that is not in the list is deleted, and its passengers board at the start (the
 *   `SET NULL` of `placement.stop_id`);
 * - a known id is updated (place, position, time, rank), and its passengers stay;
 * - an unknown id is inserted.
 * The `rank` constraint is deferred: a reordering collides with nothing before the commit.
 * `false`, and nothing written, when an id is a Stop of another Ride.
 */
export async function replaceStops(db: Kysely<Database>, ride: RideRef, stops: readonly ValidStop[]): Promise<boolean> {
  const ids = stops.map((stop) => stop.id);
  if (ids.length > 0) {
    const taken = await db
      .selectFrom("stop")
      .select("id")
      .where("id", "in", ids)
      .where((eb) => eb.or([eb("ride_id", "<>", ride.id), eb("event_id", "<>", ride.eventId)]))
      .execute();
    if (taken.length > 0) return false;
  }
  const own = (await db.selectFrom("stop").select("id").where("ride_id", "=", ride.id).execute()).map((row) => row.id);
  const gone = own.filter((id) => !ids.includes(id));
  if (gone.length > 0) await db.deleteFrom("stop").where("ride_id", "=", ride.id).where("id", "in", gone).execute();
  for (const [rank, stop] of stops.entries()) {
    if (own.includes(stop.id)) {
      await db.updateTable("stop").set(stopColumns(stop, rank)).where("id", "=", stop.id).where("ride_id", "=", ride.id).execute();
    } else {
      const columns = { id: stop.id, event_id: ride.eventId, ride_id: ride.id, leg: "aller" as const, ...stopColumns(stop, rank) };
      await db.insertInto("stop").values(columns).execute();
    }
  }
  return true;
}
