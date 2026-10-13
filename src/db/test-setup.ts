import { sql, type Kysely } from "kysely";
import { createDb } from "./client";
import { createMigrator } from "./migrator";
import type { Database } from "./schema";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

// Only these two are ever emptied, by name: never the dev and end-to-end `fullcar`,
// whatever the environment's URLs say.
const TEST_DATABASE = "fullcar_test";
const MIGRATIONS_TEST_DATABASE = "fullcar_migrations_test";

/**
 * Empties the `public` schema, after checking it belongs to the `expected` database.
 * The volume of a slot outlives a branch switch: its database may hold migrations
 * this branch does not know, which the migrator refuses.
 */
export async function resetSchema(db: Kysely<Database>, expected: string): Promise<void> {
  const { rows } = await sql<{ name: string }>`select current_database() as name`.execute(db);
  const name = rows[0]?.name;
  if (name !== expected) {
    throw new Error(`resetSchema: refusing to empty "${name}": expected "${expected}"`);
  }
  await sql`drop schema if exists public cascade`.execute(db);
  await sql`create schema public`.execute(db);
}

/**
 * docker/postgres-init.sql only runs on a fresh volume: a volume created before a
 * database was added to it does not have that database yet.
 */
async function ensureDatabase(admin: Kysely<Database>, url: string): Promise<void> {
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  const { rows } = await sql`select 1 from pg_database where datname = ${name}`.execute(admin);
  if (rows.length === 0) await sql`create database ${sql.id(name)}`.execute(admin);
}

/**
 * Vitest global setup, run once before any test file: `fullcar_test` is reset and
 * migrated to the latest version, and the migration test's own database is emptied.
 */
export default async function setup(): Promise<void> {
  const test = createDb(requireEnv("TEST_DATABASE_URL"));
  try {
    const migrationsUrl = requireEnv("MIGRATIONS_TEST_DATABASE_URL");
    await ensureDatabase(test, migrationsUrl);
    const migrationsDb = createDb(migrationsUrl);
    try {
      await resetSchema(migrationsDb, MIGRATIONS_TEST_DATABASE);
    } finally {
      await migrationsDb.destroy();
    }

    await resetSchema(test, TEST_DATABASE);
    const { error } = await createMigrator(test).migrateToLatest();
    if (error) throw error;
  } finally {
    await test.destroy();
  }
}
