import { sql, type Kysely } from "kysely";
import type { WallDate } from "@/domain/wall-clock";
import type { Database } from "./schema";

/*
 * Day 30 in the database (#588, architecture « La purge »). The purge takes each event in its
 * own transaction, under `lockEvent(…, "noKeyUpdate")`: no write on its legs runs meanwhile,
 * and one that waited sees `anonymised_at` (`lockLegs`), or no event.
 */

/**
 * The events whose last leg (the retour, otherwise the aller) falls on `cutoff` or before,
 * whatever its hour, and that the purge still has to look at: not anonymised yet, or without
 * an account. By id, so that a run takes them in the same order every time.
 */
export async function findDayThirtyEvents(db: Kysely<Database>, cutoff: WallDate): Promise<string[]> {
  const rows = await db
    .selectFrom("event")
    .select("id")
    .where(sql<boolean>`coalesce(retour_at, aller_at)::date <= ${cutoff}::date`)
    .where((eb) => eb.or([eb("anonymised_at", "is", null), eb("account_id", "is", null)]))
    .orderBy("id")
    .execute();
  return rows.map((row) => row.id);
}

/**
 * Anonymises the event (OA8.1, DS4.1): its Placements, Stops, Rides, Persons (and their personal
 * tokens) and confirmation links deleted, its position, admin token and description set to
 * null, `anonymised_at` written. The title, the place's text, the dates and the options stay.
 * The Placements before the Stops and the Rides, which would otherwise set them without a
 * boarding Stop or a car for nothing, the Stops before their Rides, and the Rides before their
 * drivers. The caller holds the Event's exclusive lock, in the
 * transaction that commits all of it.
 */
export async function anonymiseEvent(db: Kysely<Database>, eventId: string): Promise<void> {
  await db.deleteFrom("placement").where("event_id", "=", eventId).execute();
  await db.deleteFrom("stop").where("event_id", "=", eventId).execute();
  await db.deleteFrom("ride").where("event_id", "=", eventId).execute();
  await db.deleteFrom("person").where("event_id", "=", eventId).execute();
  await db.deleteFrom("email_link").where("event_id", "=", eventId).execute();
  await db
    .updateTable("event")
    .set({
      location_lat: null,
      location_lng: null,
      admin_token_hash: null,
      description: null,
      anonymised_at: sql<Date>`now()`,
    })
    .where("id", "=", eventId)
    .execute();
}

/**
 * Deletes the event (OA2.7, DS4.4): every table that holds to it has its key in `ON DELETE
 * CASCADE`, and the others `SET NULL`. The caller holds the Event's exclusive lock, so no
 * write holds one of its Rides or Persons meanwhile.
 */
export async function deleteEvent(db: Kysely<Database>, eventId: string): Promise<void> {
  await db.deleteFrom("event").where("id", "=", eventId).execute();
}
