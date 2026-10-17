import { sql, type Kysely } from "kysely";
import type { Database } from "./schema";

/**
 * Runs `fn` in one transaction. Given a transaction already (a use case composing several
 * writes, or a test under withRollback), it runs in it, and the caller commits or rolls
 * back; given the connection, it opens one, committed when `fn` resolves and rolled back
 * when it throws.
 */
export async function atomically<T>(db: Kysely<Database>, fn: (trx: Kysely<Database>) => Promise<T>): Promise<T> {
  if (db.isTransaction) return fn(db);
  return db.transaction().execute(fn);
}

/** The levels where a transaction keeps one snapshot from its first query to its end. */
const ONE_SNAPSHOT_LEVELS = ["repeatable read", "serializable"];

/**
 * Runs the reads of `fn` on one snapshot of the database: a write committed between two
 * of them shows in none of them. Given the connection, it opens a read-only transaction in
 * REPEATABLE READ, whose snapshot is taken at its first query. Given a transaction already
 * (a test under withRollback, a use case that reads after its writes), it reads in it, but
 * only in REPEATABLE READ or SERIALIZABLE: in READ COMMITTED, Postgres's default and what
 * `atomically` opens, each read would see its own snapshot, so it throws instead.
 */
export async function onOneSnapshot<T>(db: Kysely<Database>, fn: (trx: Kysely<Database>) => Promise<T>): Promise<T> {
  if (!db.isTransaction) {
    return db.transaction().setIsolationLevel("repeatable read").setAccessMode("read only").execute(fn);
  }
  const { rows } = await sql<{ level: string }>`select current_setting('transaction_isolation') as level`.execute(db);
  const level = rows[0]?.level;
  if (level === undefined || !ONE_SNAPSHOT_LEVELS.includes(level)) {
    throw new Error(`onOneSnapshot: the transaction given is in ${level ?? "an unknown level"}, not repeatable read`);
  }
  return fn(db);
}
