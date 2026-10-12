import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { Database } from "./schema";

export function createDb(connectionString: string): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ connectionString, max: 5 }),
    }),
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
