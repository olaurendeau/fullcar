import { sql, type Kysely } from "kysely";
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

async function backendPid(db: Kysely<Database>) {
  const { rows } = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(db);
  return rows[0]!.pid;
}

/**
 * Resolves once the session `waiter` waits for a lock that the session `holder` holds. That
 * session only: one of another test file may wait for the same lock (the global cap of the
 * sends), and would prove nothing of this test (#841). Throws once `ended()`.
 */
async function waitsFor(db: Kysely<Database>, waiter: number, holder: number, ended: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt++) {
    const { rows } = await sql<{ waits: boolean }>`
      select ${holder}::int = any(pg_blocking_pids(${waiter}::int)) as waits`.execute(db);
    if (rows[0]!.waits) return;
    if (ended()) throw new Error("whileHeld: second ended without waiting for first");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("whileHeld: second never waited for first");
}

/**
 * For a concurrency test on committed data: `first` in a transaction (REPEATABLE READ)
 * held open until `second`, run on the connection it is given, of its own, waits for one of
 * its locks, then committed. `second` must run on that connection: whileHeld waits for its
 * session, no other. `whileWaiting`, given the pid of that session, looks at what it holds
 * before the commit. Gives what `second` gives; when `second` fails before waiting, its error.
 */
export async function whileHeld<T>(
  db: Kysely<Database>,
  first: (trx: Kysely<Database>) => Promise<unknown>,
  second: (own: Kysely<Database>) => Promise<T>,
  whileWaiting?: (waitingPid: number) => Promise<void>,
): Promise<T> {
  const holder = await db.startTransaction().setIsolationLevel("repeatable read").execute();
  try {
    await first(holder);
    const pid = await backendPid(holder);
    return await db.connection().execute(async (own) => {
      const waiter = await backendPid(own);
      let ended = false;
      const pending = second(own).finally(() => void (ended = true));
      pending.catch(() => {});
      try {
        await waitsFor(db, waiter, pid, () => ended);
      } catch (error) {
        if (ended) await pending;
        throw error;
      }
      await whileWaiting?.(waiter);
      await holder.commit().execute();
      return await pending;
    });
  } finally {
    try {
      await holder.rollback().execute();
    } catch {
      // Already committed: nothing to give back.
    }
  }
}
