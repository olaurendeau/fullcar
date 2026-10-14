import type { Transaction } from "kysely";
import { getDb } from "./client";
import type { Database } from "./schema";

/**
 * Runs `fn` in a transaction that is always rolled back, so a data test leaves
 * `fullcar_test` as it found it and test files can share the database in parallel.
 * Code under test must take the transaction as its connection, not call getDb().
 * When `fn` fails, its error is the one thrown, even if the rollback fails as well.
 * In REPEATABLE READ: from its first read on, the transaction does not see rows that a
 * concurrency test (withCommittedEvent) commits in parallel, so counting rows stays exact.
 */
export async function withRollback<T>(fn: (trx: Transaction<Database>) => Promise<T>): Promise<T> {
  const trx = await getDb().startTransaction().setIsolationLevel("repeatable read").execute();
  let result: T;
  try {
    result = await fn(trx);
  } catch (error) {
    await trx
      .rollback()
      .execute()
      .catch(() => {});
    throw error;
  }
  await trx.rollback().execute();
  return result;
}
