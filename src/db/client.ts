import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { Database } from "./schema";

const DATE_OID = 1082;
const TIMESTAMP_OID = 1114;
// pg's TypeId lists scalar types only: array OIDs are plain numbers, cast where pg wants one.
type TypeId = Parameters<typeof pg.types.getTypeParser>[0];
const DATE_ARRAY_OID: number = 1182;
const TIMESTAMP_ARRAY_OID: number = 1115;
const TEXT_ARRAY_OID: number = 1009;

/**
 * `date` and `timestamp` (without time zone) are calendar values: parsed into a JS Date,
 * they would be shifted by the time zone of the server reading them. They stay the
 * strings Postgres sends, and their arrays arrays of those strings. Set on each pool,
 * never on the global pg.types.
 */
const types: pg.CustomTypesConfig = {
  getTypeParser: (id, format) => {
    const oid: number = id;
    if (oid === DATE_OID || oid === TIMESTAMP_OID) return (value: string) => value;
    if (oid === DATE_ARRAY_OID || oid === TIMESTAMP_ARRAY_OID) {
      return pg.types.getTypeParser(TEXT_ARRAY_OID as TypeId, format);
    }
    return pg.types.getTypeParser(id, format);
  },
};

/** Logged alone: the error may carry a query, its parameters or a connection string. */
export const POOL_ERROR_MESSAGE = "Postgres: a connection of the pool failed";

/**
 * A serverless instance can be frozen with connections open, which the server or Neon's
 * pooler then closes. The error is logged instead of crashing the process, whether the
 * connection was idle or lent out, in the middle of a transaction: the queries still sent
 * on it fail, and the pool opens a new connection for the next ones.
 */
export function createPool(connectionString: string): pg.Pool {
  const pool = new pg.Pool({ connectionString, max: 5, idleTimeoutMillis: 5_000, types });
  // pg-pool removes its own listener while a connection is lent out, and Kysely adds none:
  // each connection gets one for its whole life, and logs its failure once.
  pool.on("connect", (client) => {
    let failed = false;
    client.on("error", () => {
      if (failed) return;
      failed = true;
      console.error(POOL_ERROR_MESSAGE);
    });
  });
  // The connection's own listener has logged it; without this one, the pool would throw.
  pool.on("error", () => {});
  return pool;
}

export function createDb(connectionString: string): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool: createPool(connectionString) }),
  });
}

let db: Kysely<Database> | undefined;

/** The application's connection, built on first use from DATABASE_URL. */
export function getDb(): Kysely<Database> {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    db = createDb(url);
  }
  return db;
}
