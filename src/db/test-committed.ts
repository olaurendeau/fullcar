import { sql, type ControlledTransaction, type Kysely } from "kysely";
import { getDb } from "./client";
import type { Database } from "./schema";
import { seedEvent } from "./test-events";

/**
 * For a concurrency test, which needs two connections to see the same rows: a rolled-back
 * transaction cannot show two simultaneous writes. Seeds an event committed with getDb(),
 * which belongs to this test alone, and hands `fn` the connection, the event's id, and its
 * organiser's token.
 * Everything the test commits must hang off that event: deleting it at the end, even
 * when `fn` fails, takes the rest with it by cascade. When `fn` fails, its error is the
 * one thrown, even if the delete fails as well.
 */
export async function withCommittedEvent<T>(
  fn: (db: Kysely<Database>, eventId: string, token: string) => Promise<T>,
): Promise<T> {
  const db = getDb();
  const { id, token } = await seedEvent(db);
  const remove = async () => {
    await db.deleteFrom("event").where("id", "=", id).execute();
  };
  let result: T;
  try {
    result = await fn(db, id, token);
  } catch (error) {
    await remove().catch(() => {});
    throw error;
  }
  await remove();
  return result;
}

async function backendPid(trx: ControlledTransaction<Database>) {
  const { rows } = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(trx);
  return rows[0]!.pid;
}

/** Resolves once some session waits for a lock that the session `pid` holds. */
async function someoneBlockedBy(db: Kysely<Database>, pid: number) {
  for (let attempt = 0; attempt < 120; attempt++) {
    const { rows } = await sql<{ pid: number }>`
      select pid from pg_stat_activity where ${pid}::int = any(pg_blocking_pids(pid))`.execute(db);
    if (rows.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("no session ever waited for the first one");
}

/**
 * For a concurrency test on committed data: `first` in a transaction (REPEATABLE READ)
 * held open until `second`, run on `db`, waits for one of its locks, then committed.
 * Gives what `second` gives.
 */
export async function whileHeld<T>(
  db: Kysely<Database>,
  first: (trx: Kysely<Database>) => Promise<unknown>,
  second: () => Promise<T>,
): Promise<T> {
  const holder = await db.startTransaction().setIsolationLevel("repeatable read").execute();
  try {
    await first(holder);
    const pid = await backendPid(holder);
    const pending = second();
    pending.catch(() => {});
    await someoneBlockedBy(db, pid);
    await holder.commit().execute();
    return await pending;
  } finally {
    try {
      await holder.rollback().execute();
    } catch {
      // Already committed: nothing to give back.
    }
  }
}
