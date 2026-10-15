import type { Kysely } from "kysely";
import { getDb } from "./client";
import type { Database } from "./schema";
import { seedEvent } from "./test-events";

/**
 * For a concurrency test, which needs two connections to see the same rows: a rolled-back
 * transaction cannot show two simultaneous writes. Seeds an event committed with getDb(),
 * which belongs to this test alone, and hands `fn` the connection and the event's id.
 * Everything the test commits must hang off that event: deleting it in `finally`, even
 * when `fn` fails, takes the rest with it by cascade.
 */
export async function withCommittedEvent<T>(fn: (db: Kysely<Database>, eventId: string) => Promise<T>): Promise<T> {
  const db = getDb();
  const { id } = await seedEvent(db);
  try {
    return await fn(db, id);
  } finally {
    await db.deleteFrom("event").where("id", "=", id).execute();
  }
}
