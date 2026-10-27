import type { Kysely, Selectable } from "kysely";
import type { NewEvent } from "@/domain/event";
import { generatePublicId } from "@/domain/public-id";
import type { Database, EventTable } from "./schema";

/**
 * Ids drawn before giving up. With 57⁸ ids, even one collision is rare: several in a row
 * mean a broken generator, and looping on it would only hold the request open.
 */
export const INSERT_ATTEMPTS = 5;

/**
 * Stores the event under a new public id and returns that id. A taken id is not an error:
 * the insert does nothing (no failed statement, so a surrounding transaction survives),
 * and a new id is drawn.
 * `adminTokenHash` is the domain's lowercase hex SHA-256: stored as its 32 bytes.
 */
export async function insertEvent(
  db: Kysely<Database>,
  event: NewEvent,
  adminTokenHash: string,
  newId: () => string = generatePublicId,
): Promise<string> {
  for (let attempt = 0; attempt < INSERT_ATTEMPTS; attempt++) {
    const inserted = await db
      .insertInto("event")
      .values({
        id: newId(),
        title: event.title,
        location: event.location,
        location_lat: event.locationPosition?.lat ?? null,
        location_lng: event.locationPosition?.lng ?? null,
        aller_at: event.allerAt,
        retour_at: event.retourAt,
        description: event.description,
        boosters_enabled: event.boostersEnabled,
        participation_enabled: event.participationEnabled,
        stops_enabled: event.stopsEnabled,
        admin_token_hash: Buffer.from(adminTokenHash, "hex"),
      })
      .onConflict((conflict) => conflict.column("id").doNothing())
      .returning("id")
      .executeTakeFirst();
    if (inserted) return inserted.id;
  }
  throw new Error(`insertEvent: no free id after ${INSERT_ATTEMPTS} attempts`);
}

/**
 * The stored hash of the event's admin token, in lowercase hex; `null` for an event without
 * a token (revoked, #586), which no token matches; nothing for an unknown id.
 */
export async function readAdminTokenHash(db: Kysely<Database>, id: string): Promise<string | null | undefined> {
  const row = await db.selectFrom("event").select("admin_token_hash").where("id", "=", id).executeTakeFirst();
  if (row === undefined) return undefined;
  return row.admin_token_hash?.toString("hex") ?? null;
}

/**
 * What anyone holding the public link may read, listed one by one: a column added to the
 * table stays private until it is added here. Never `admin_token_hash`.
 * `anonymised_at` is: the link of an anonymised event says « Événement terminé » to anyone (#590).
 */
const PUBLIC_EVENT_COLUMNS = [
  "id",
  "title",
  "location",
  "location_lat",
  "location_lng",
  "aller_at",
  "retour_at",
  "description",
  "boosters_enabled",
  "participation_enabled",
  "stops_enabled",
  "anonymised_at",
] as const;

export type PublicEvent = Pick<Selectable<EventTable>, (typeof PUBLIC_EVENT_COLUMNS)[number]>;

/** The event's public fields; nothing for an unknown id. The id is compared as is: case counts. */
export async function findEventById(db: Kysely<Database>, id: string): Promise<PublicEvent | undefined> {
  return db.selectFrom("event").select(PUBLIC_EVENT_COLUMNS).where("id", "=", id).executeTakeFirst();
}

/**
 * The row lock `lockEvent` takes. `share` for a write on a leg: such writes do not wait for
 * each other. `noKeyUpdate` for a change of the event's fields: it waits for the writes on
 * the legs under way, and they wait for it.
 */
export type EventLock = "share" | "noKeyUpdate";

/** The event as `lockEvent` gives it. */
export type LockedEvent = PublicEvent & Pick<Selectable<EventTable>, "account_id">;

/**
 * `SELECT … FOR SHARE`, or `FOR NO KEY UPDATE`, on the event, held until the transaction
 * ends: the first lock of every write on a leg (lock order: Event, then Ride, then Person).
 * Under READ COMMITTED, a lock obtained after waiting gives the row as committed: a write
 * that waited for the removal of the retour sees `retour_at` null (M3.6), and one that waited
 * for the purge sees `anonymised_at` (#588). Gives the public fields, and what a write decides
 * on under the lock: its account and when it was anonymised. Nothing for an unknown event.
 * Outside a transaction the lock ends with the statement: call it inside `atomically`.
 */
export async function lockEvent(db: Kysely<Database>, id: string, lock: EventLock): Promise<LockedEvent | undefined> {
  const query = db
    .selectFrom("event")
    .select([...PUBLIC_EVENT_COLUMNS, "account_id"])
    .where("id", "=", id);
  return (lock === "share" ? query.forShare() : query.forNoKeyUpdate()).executeTakeFirst();
}

/**
 * `SELECT … FOR KEY SHARE` on the event, until the transaction ends: it cannot be deleted
 * before a row that refers to it is written, and no write on it waits (a sign-in link's
 * return target, OA4.4). Whether the event exists. Taken before the address, like lockEvent.
 */
export async function holdEventKey(db: Kysely<Database>, id: string): Promise<boolean> {
  const row = await db.selectFrom("event").select("id").where("id", "=", id).forKeyShare().executeTakeFirst();
  return row !== undefined;
}

/**
 * What the organiser changes: the options and the token are not among them. Without
 * `locationPosition`, the position stored stays as it is; without `description`, the
 * description stored does.
 */
export type EventFieldsChange = Pick<NewEvent, "title" | "location" | "allerAt" | "retourAt"> &
  Partial<Pick<NewEvent, "locationPosition" | "description">>;

/**
 * Whether the event existed, and now has these fields. A retour removed has its Rides and
 * Placements deleted first, in the same transaction, under `lockEvent(…, "noKeyUpdate")`
 * (`removeRetour`): no row of the retour stays under a `retour_at` null.
 */
export async function writeEventFields(db: Kysely<Database>, id: string, fields: EventFieldsChange): Promise<boolean> {
  const { locationPosition: position, description } = fields;
  const result = await db
    .updateTable("event")
    .set({ title: fields.title, location: fields.location, aller_at: fields.allerAt, retour_at: fields.retourAt })
    .$if(position !== undefined, (update) =>
      update.set({ location_lat: position?.lat ?? null, location_lng: position?.lng ?? null }),
    )
    .$if(description !== undefined, (update) => update.set({ description }))
    .where("id", "=", id)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}
