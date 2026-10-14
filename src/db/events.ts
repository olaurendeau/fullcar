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
        aller_at: event.allerAt,
        retour_at: event.retourAt,
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

/** The stored hash of the event's admin token, in lowercase hex; nothing for an unknown id. */
export async function readAdminTokenHash(db: Kysely<Database>, id: string): Promise<string | undefined> {
  const row = await db.selectFrom("event").select("admin_token_hash").where("id", "=", id).executeTakeFirst();
  return row?.admin_token_hash.toString("hex");
}

/**
 * What anyone holding the public link may read, listed one by one: a column added to the
 * table stays private until it is added here. Never `admin_token_hash`.
 */
const PUBLIC_EVENT_COLUMNS = [
  "id",
  "title",
  "location",
  "aller_at",
  "retour_at",
  "boosters_enabled",
  "participation_enabled",
  "stops_enabled",
] as const;

export type PublicEvent = Pick<Selectable<EventTable>, (typeof PUBLIC_EVENT_COLUMNS)[number]>;

/** The event's public fields; nothing for an unknown id. The id is compared as is: case counts. */
export async function findEventById(db: Kysely<Database>, id: string): Promise<PublicEvent | undefined> {
  return db.selectFrom("event").select(PUBLIC_EVENT_COLUMNS).where("id", "=", id).executeTakeFirst();
}
