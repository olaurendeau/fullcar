import { sql, type Kysely } from "kysely";
import { NO_MIGRATIONS, type MigrationResultSet } from "kysely/migration";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminTokenMatches } from "@/domain/admin-token";
import { createDb } from "./client";
import { createMigrator } from "./migrator";
import type { Database } from "./schema";
import { migrations } from "./migrations";
import { seedEvent } from "./test-events";

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

/** Every column, constraint and index of the public schema, as Postgres describes them. */
async function schemaOf(db: Kysely<Database>) {
  const { rows: columns } = await sql`
    select table_name, column_name, data_type, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'public' and table_name not like 'kysely_%'
    order by table_name, column_name`.execute(db);
  const { rows: constraints } = await sql`
    select conrelid::regclass::text as table_name, conname, pg_get_constraintdef(oid) as definition
    from pg_constraint
    where connamespace = 'public'::regnamespace and conrelid::regclass::text not like 'kysely_%'
    order by conrelid::regclass::text, conname`.execute(db);
  const { rows: indexes } = await sql`
    select tablename, indexname, indexdef from pg_indexes
    where schemaname = 'public' and tablename not like 'kysely_%'
    order by tablename, indexname`.execute(db);
  return { columns, constraints, indexes };
}

/** The definition of a constraint of the event table, as Postgres writes it back. */
async function constraintDefinition(db: Kysely<Database>, name: string) {
  const { rows } = await sql<{ definition: string }>`
    select pg_get_constraintdef(oid) as definition from pg_constraint
    where conrelid = 'event'::regclass and conname = ${name}`.execute(db);
  expect(rows).toHaveLength(1);
  return rows[0]?.definition;
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

  // #586: the down of 0004 gives back exactly what 0003 left: columns, constraints, indexes.
  it("0004 goes down to the schema 0003 left", async () => {
    const migrator = createMigrator(db);
    expectSuccess(await migrator.migrateTo("0003_positions"));
    const before = await schemaOf(db);
    expectSuccess(await migrator.migrateTo("0004_accounts"));
    expect(await schemaOf(db)).not.toEqual(before);
    expectSuccess(await migrator.migrateTo("0003_positions"));
    expect(await schemaOf(db)).toEqual(before);
    expectSuccess(await migrator.migrateToLatest());
  });

  // #706: the down of 0005 gives back exactly what 0004 left: columns, constraints, indexes,
  // the definition of event_anonymised_bare among them, which 0005 extends to the description.
  it("0005 goes down to the schema 0004 left", async () => {
    const migrator = createMigrator(db);
    expectSuccess(await migrator.migrateTo("0004_accounts"));
    const before = await schemaOf(db);
    const bare = await constraintDefinition(db, "event_anonymised_bare");
    expect(bare).not.toContain("description");
    expectSuccess(await migrator.migrateTo("0005_event_description"));
    expect(await schemaOf(db)).not.toEqual(before);
    expect(await constraintDefinition(db, "event_anonymised_bare")).toContain("description IS NULL");
    expectSuccess(await migrator.migrateTo("0004_accounts"));
    expect(await constraintDefinition(db, "event_anonymised_bare")).toBe(bare);
    expect(await schemaOf(db)).toEqual(before);
    expectSuccess(await migrator.migrateToLatest());
  });

  // 0003 has no room for an event without a token: going down gives each one a hash of its
  // own, which no token matches, rather than failing or deleting the event.
  it("0004 goes down with events whose token was revoked, still unusable", async () => {
    const migrator = createMigrator(db);
    expectSuccess(await migrator.migrateTo("0004_accounts"));
    const events = [await seedEvent(db), await seedEvent(db)];
    const ids = events.map((event) => event.id);
    try {
      const { id: accountId } = await db
        .insertInto("account")
        .values({ email: "camille@exemple.fr", locale: "fr" })
        .returning("id")
        .executeTakeFirstOrThrow();
      await db
        .updateTable("event")
        .set({ admin_token_hash: null, account_id: accountId, confirmed_at: new Date() })
        .where("id", "in", ids)
        .execute();
      expectSuccess(await migrator.migrateTo("0003_positions"));
      const { rows } = await sql<{ hash: Buffer }>`
        select admin_token_hash as hash from event where id in (${sql.join(ids)})`.execute(db);
      const hashes = rows.map((row) => row.hash.toString("hex"));
      expect(hashes).toHaveLength(2);
      for (const hash of hashes) expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(new Set(hashes).size).toBe(2);
      for (const hash of hashes) {
        for (const { token } of events) expect(adminTokenMatches(token, hash)).toBe(false);
      }
    } finally {
      await db.deleteFrom("event").where("id", "in", ids).execute();
      expectSuccess(await migrator.migrateToLatest());
    }
  });

  it("going all the way down leaves no table behind", async () => {
    const migrator = createMigrator(db);
    expectSuccess(await migrator.migrateToLatest());
    expectSuccess(await migrator.migrateTo(NO_MIGRATIONS));
    expect(await userTables(db)).toEqual([]);
  });
});
