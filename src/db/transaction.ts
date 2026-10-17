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
