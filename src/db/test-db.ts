import type { Transaction } from "kysely";
import { getDb } from "./client";
import type { Database } from "./schema";

/**
 * Runs `fn` in a transaction that is always rolled back, so a data test leaves
 * `fullcar_test` as it found it and test files can share the database in parallel.
 * Code under test must take the transaction as its connection, not call getDb().
 */
export async function withRollback<T>(fn: (trx: Transaction<Database>) => Promise<T>): Promise<T> {
  const trx = await getDb().startTransaction().execute();
  try {
    return await fn(trx);
  } finally {
    await trx.rollback().execute();
  }
}
