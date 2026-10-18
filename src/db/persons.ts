import type { Kysely } from "kysely";
import type { TokenHolder } from "@/domain/device";
import type { Database } from "./schema";

/**
 * A person to store. `id` is the creation id drawn by the browser; `tokenHash` is the
 * domain's lowercase hex SHA-256 of the personal token, stored as its 32 bytes.
 */
export interface NewPerson {
  id: string;
  eventId: string;
  firstName: string;
  phone: string | null;
  tokenHash: string;
}

/** What holds a person's id, for the caller to tell a resent creation from a stranger's. */
export interface StoredPerson {
  id: string;
  eventId: string;
  firstName: string;
  tokenHash: string;
  /** Whether this call stored it: false when the id was already taken, even by a send still in flight. */
  created: boolean;
}

export interface PersonRef {
  id: string;
  eventId: string;
}

/**
 * Stores the person, unless its id is taken: then nothing is written (no failed
 * statement, so a surrounding transaction survives), and the person already stored under
 * that id in this event is returned as it is, whatever its hash: comparing it is the
 * caller's job, and `created` is false. Nothing when another event holds the id: none of
 * its data comes back.
 */
export async function insertPerson(db: Kysely<Database>, person: NewPerson): Promise<StoredPerson | undefined> {
  const inserted = await db
    .insertInto("person")
    .values({
      id: person.id,
      event_id: person.eventId,
      first_name: person.firstName,
      phone: person.phone,
      token_hash: Buffer.from(person.tokenHash, "hex"),
    })
    .onConflict((conflict) => conflict.column("id").doNothing())
    .returning("id")
    .executeTakeFirst();
  const row = await db
    .selectFrom("person")
    .select(["id", "event_id", "first_name", "token_hash"])
    .where("id", "=", person.id)
    .where("event_id", "=", person.eventId)
    .executeTakeFirst();
  return (
    row && {
      id: row.id,
      eventId: row.event_id,
      firstName: row.first_name,
      tokenHash: row.token_hash.toString("hex"),
      created: inserted !== undefined,
    }
  );
}

/** Whether a person of that event had that id, and now has these first name and number. */
export async function updatePerson(
  db: Kysely<Database>,
  person: PersonRef,
  fields: Pick<NewPerson, "firstName" | "phone">,
): Promise<boolean> {
  const result = await db
    .updateTable("person")
    .set({ first_name: fields.firstName, phone: fields.phone })
    .where("id", "=", person.id)
    .where("event_id", "=", person.eventId)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

/**
 * Every person of the event with the hash of its token, in lowercase hex, as
 * `devicePersonIds` compares them: all of them, never looked up by hash (C12.2).
 */
export async function readTokenHolders(db: Kysely<Database>, eventId: string): Promise<TokenHolder[]> {
  const rows = await db
    .selectFrom("person")
    .select(["id", "token_hash"])
    .where("event_id", "=", eventId)
    .orderBy("created_at")
    .orderBy("id")
    .execute();
  return rows.map((row) => ({ id: row.id, tokenHash: row.token_hash.toString("hex") }));
}

/**
 * `SELECT … FOR UPDATE` on those of `ids` that are persons of the event, in id order, held
 * until the transaction ends; returns their ids, in that order. A write that also locks a
 * Ride locks it first (lock order: Ride, then Person). Call it inside `atomically`.
 */
export async function lockPersons(db: Kysely<Database>, eventId: string, ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .selectFrom("person")
    .select("id")
    .where("event_id", "=", eventId)
    .where("id", "in", ids)
    .orderBy("id")
    .forUpdate()
    .execute();
  return rows.map((row) => row.id);
}
