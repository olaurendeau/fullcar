import { sql, type Kysely } from "kysely";
import { NO_MIGRATIONS, type MigrationResultSet } from "kysely/migration";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "./client";
import { createMigrator } from "./migrator";
import type { Database } from "./schema";
import { migrations } from "./migrations";

function expectSuccess({ error, results }: MigrationResultSet) {
  expect(error).toBeUndefined();
  for (const result of results ?? []) expect(result.status).toBe("Success");
}

async function userTables(db: Kysely<Database>): Promise<string[]> {
  const { rows } = await sql<{ name: string }>`
    select table_name as name from information_schema.tables
    where table_schema = 'public' and table_name not like 'kysely_%'
    order by table_name`.execute(db);
  return rows.map((row) => row.name);
}

describe("migrations", () => {
  let db: Kysely<Database>;

  // Its own database, emptied by the global setup: taking the schema up and down here
  // would otherwise pull tables from under the data tests running in parallel.
  // Checked before any test: going up and down on another database would wreck it.
  beforeAll(async () => {
    const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
    if (!url) throw new Error("MIGRATIONS_TEST_DATABASE_URL is not set");
    db = createDb(url);
    const { rows } = await sql<{ name: string }>`
      select current_database() as name`.execute(db);
    expect(rows[0]?.name).toBe("fullcar_migrations_test");
  });

  afterAll(async () => {
    await db?.destroy();
  });

  it("each migration goes up, down and up again", async () => {
    const migrator = createMigrator(db);
    for (let i = 0; i < Object.keys(migrations).length; i++) {
      expectSuccess(await migrator.migrateUp());
      expectSuccess(await migrator.migrateDown());
      expectSuccess(await migrator.migrateUp());
    }
  });

  it("going all the way down leaves no table behind", async () => {
    const migrator = createMigrator(db);
    expectSuccess(await migrator.migrateToLatest());
    expectSuccess(await migrator.migrateTo(NO_MIGRATIONS));
    expect(await userTables(db)).toEqual([]);
  });
});
