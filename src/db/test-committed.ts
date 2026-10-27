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
 * Resolves once the session `waiter` waits for a lock that one of the sessions `holders`
 * holds. Those sessions only: one of another test file may wait for the same lock (the
 * global cap of the sends), and would prove nothing of this test (#841). Throws once `ended()`.
 */
async function waitsFor(db: Kysely<Database>, waiter: number, holders: number[], ended: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt++) {
    const { rows } = await sql<{ waits: boolean }>`
      select pg_blocking_pids(${waiter}::int) && ${holders}::int[] as waits`.execute(db);
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
 * session, no other. `whileWaiting`, given the pid of that session and first's transaction,
 * looks at what it holds, or writes in first, before the commit. Gives what `second` gives;
 * when `second` fails before waiting, its error.
 * `own` is one connection: a `second` that opens a transaction on it, then queries `own`
 * itself instead of that transaction, waits for itself until Vitest's timeout. Whatever
 * fails, whileHeld gives `own` back only once `second` is over, the holder rolled back.
 * So a `second` that never ends keeps `own` past Vitest's timeout, on a test already failed
 * (#856). Ending its session would not end such a `second`: one that waits for itself waits
 * in JavaScript, for its own connection, not in Postgres.
 */
export async function whileHeld<T>(
  db: Kysely<Database>,
  first: (trx: Kysely<Database>) => Promise<unknown>,
  second: (own: Kysely<Database>) => Promise<T>,
  whileWaiting?: (waitingPid: number, trx: Kysely<Database>) => Promise<void>,
): Promise<T> {
  const [answer] = await held(db, first, [second], async ([pid], trx) => {
    await whileWaiting?.(pid!, trx);
  });
  return answer!;
}

/**
 * The pool has 5 connections (client.ts): the holder takes one, each second one, and each
 * look at the waiting sessions one more. With more seconds, that look would wait for the
 * pool until Vitest's timeout, the holder never rolled back.
 */
const MOST_SECONDS = 3;

/**
 * whileHeld for several sessions, at most 3: each of `seconds`, on a connection of its own,
 * starts once the one before it waits, and must wait in turn, for first or behind one before
 * it (queued for the same lock, or for one it holds). Then first is committed. Gives what
 * each gives, in order; when one fails before waiting, its error. Each connection is given
 * back as whileHeld does.
 */
export async function whileHeldInTurn<T>(
  db: Kysely<Database>,
  first: (trx: Kysely<Database>) => Promise<unknown>,
  seconds: ((own: Kysely<Database>) => Promise<T>)[],
): Promise<T[]> {
  return held(db, first, seconds, async () => {});
}

async function held<T>(
  db: Kysely<Database>,
  first: (trx: Kysely<Database>) => Promise<unknown>,
  seconds: ((own: Kysely<Database>) => Promise<T>)[],
  whileWaiting: (waitingPids: number[], trx: Kysely<Database>) => Promise<void>,
): Promise<T[]> {
  if (seconds.length > MOST_SECONDS) {
    throw new Error(`whileHeldInTurn: at most ${MOST_SECONDS} seconds, the pool has 5 connections (${seconds.length} given)`);
  }
  const holder = await db.startTransaction().setIsolationLevel("repeatable read").execute();
  const release = async () => {
    try {
      await holder.rollback().execute();
    } catch {
      // Already committed or rolled back: nothing to give back.
    }
  };
  // `sessions`: the holder's, then those of the seconds already waiting.
  const inTurn = async (rest: typeof seconds, sessions: number[]): Promise<T[]> => {
    const [second, ...later] = rest;
    if (second === undefined) {
      await whileWaiting(sessions.slice(1), holder);
      await holder.commit().execute();
      return [];
    }
    return db.connection().execute(async (own) => {
      const waiter = await backendPid(own);
      let ended = false;
      const pending = second(own).finally(() => void (ended = true));
      pending.catch(() => {});
      try {
        try {
          await waitsFor(db, waiter, sessions, () => ended);
        } catch (error) {
          if (ended) await pending;
          throw error;
        }
        const answers = await inTurn(later, [...sessions, waiter]);
        return [await pending, ...answers];
      } finally {
        // Still waiting, `second` would carry on after the rollback on a connection the pool lent again.
        await release();
        await pending.catch(() => {});
      }
    });
  };
  try {
    await first(holder);
    return await inTurn(seconds, [await backendPid(holder)]);
  } finally {
    await release();
  }
}
