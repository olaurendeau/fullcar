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
 * Anonymises the event (OA8.1, DS4.1, OT7.1): its Placements, Stops, Rides, Persons (and their personal
 * tokens) and links deleted (confirmation and transfer: they hold to the event, not to a kind), its position, admin token and description set to
 * null, the handover that waits cleared with its address (`event_transfer_open` refuses an anonymised event that has one),
 * `anonymised_at` written. The title, the place's text, the dates and the options stay.
 * The Placements before the Rides, which would otherwise set them without a car for
 * nothing, and the Rides before their drivers. The Stops go with their Rides (`stop_ride_fk`
 * and `stop_event_fk` cascade), with no delete of their own. The caller holds the Event's exclusive lock, in the
 * transaction that commits all of it.
 */
export async function anonymiseEvent(db: Kysely<Database>, eventId: string): Promise<void> {
  await db.deleteFrom("placement").where("event_id", "=", eventId).execute();
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
      transfer_email: null,
      transfer_status: null,
      transfer_status_at: null,
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
