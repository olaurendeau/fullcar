import type { Kysely } from "kysely";
import { getDb } from "./client";
import type { Database } from "./schema";
import { seedEvent } from "./test-events";

/**
 * For a concurrency test, which needs two connections to see the same rows: a rolled-back
 * transaction cannot show two simultaneous writes. Seeds an event committed with getDb(),
 * which belongs to this test alone, and hands `fn` the connection and the event's id.
 * Everything the test commits must hang off that event: deleting it at the end, even
 * when `fn` fails, takes the rest with it by cascade. When `fn` fails, its error is the
 * one thrown, even if the delete fails as well.
 */
export async function withCommittedEvent<T>(fn: (db: Kysely<Database>, eventId: string) => Promise<T>): Promise<T> {
  const db = getDb();
  const { id } = await seedEvent(db);
  const remove = async () => {
    await db.deleteFrom("event").where("id", "=", id).execute();
  };
  let result: T;
  try {
    result = await fn(db, id);
  } catch (error) {
    await remove().catch(() => {});
    throw error;
  }
  await remove();
  return result;
}
