import type { Kysely } from "kysely";
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

/**
 * Runs the reads of `fn` on one snapshot of the database: a write committed between two
 * of them shows in none of them. Given a transaction already (a test under withRollback,
 * in REPEATABLE READ), it reads in it; given the connection, it opens a read-only one in
 * REPEATABLE READ, whose snapshot is taken at its first query.
 */
export async function onOneSnapshot<T>(db: Kysely<Database>, fn: (trx: Kysely<Database>) => Promise<T>): Promise<T> {
  if (db.isTransaction) return fn(db);
  return db.transaction().setIsolationLevel("repeatable read").setAccessMode("read only").execute(fn);
}
