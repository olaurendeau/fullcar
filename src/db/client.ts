import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { Database } from "./schema";

const DATE_OID = 1082;
const TIMESTAMP_OID = 1114;

/**
 * `date` and `timestamp` (without time zone) are calendar values: parsed into a JS Date,
 * they would be shifted by the time zone of the server reading them. They stay the
 * strings Postgres sends. Set on each pool, never on the global pg.types.
 */
const types: pg.CustomTypesConfig = {
  getTypeParser: (id, format) =>
    id === DATE_OID || id === TIMESTAMP_OID
      ? (value: string) => value
      : pg.types.getTypeParser(id, format),
};

/** Logged alone: the error may carry a query, its parameters or a connection string. */
export const POOL_ERROR_MESSAGE = "Postgres: an idle connection of the pool failed";

/**
 * A serverless instance can be frozen with connections open, which the server or Neon's
 * pooler then closes: an idle connection's error is logged instead of crashing the
 * process, and the pool opens a new connection for the next query.
 */
export function createPool(connectionString: string): pg.Pool {
  const pool = new pg.Pool({ connectionString, max: 5, idleTimeoutMillis: 5_000, types });
  pool.on("error", () => {
    console.error(POOL_ERROR_MESSAGE);
  });
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
