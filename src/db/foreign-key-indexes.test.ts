import { sql, type RawBuilder, type Transaction } from "kysely";
import { describe, expect, it } from "vitest";
import type { Database } from "./schema";
import { withRollback } from "./test-db";

type Trx = Transaction<Database>;

type ForeignKey = { table: string; name: string; columns: string[] };

/** The columns of the foreign key `c`, in the key's order. */
const KEY_COLUMNS = sql`array(
  select a.attname from unnest(c.conkey) with ordinality as k(attnum, n)
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
  order by k.n
)::text[]`;

/**
 * Every foreign key of a schema, with its columns in the key's order. Postgres indexes the
 * referenced side, never the referencing one: without an index there, deleting a row of
 * the referenced table, or checking it, reads the whole referencing table.
 */
async function foreignKeys(trx: Trx, schema: string) {
  const { rows } = await sql<ForeignKey>`
    select c.conrelid::regclass::text as table, c.conname as name,
           ${KEY_COLUMNS} as columns
    from pg_constraint c
    where c.contype = 'f' and c.connamespace = ${schema}::regnamespace
    order by 1, 2`.execute(trx);
  return rows;
}

/**
 * The foreign keys of a schema that no index covers: one whose leading columns are the
 * key's columns, in any order, and that is valid and not partial. An index on more
 * columns covers a key on its first ones; an index on fewer does not.
 */
async function uncoveredForeignKeys(trx: Trx, schema: string) {
  const { rows } = await sql<ForeignKey>`
    select c.conrelid::regclass::text as table, c.conname as name,
           ${KEY_COLUMNS} as columns
    from pg_constraint c
    where c.contype = 'f' and c.connamespace = ${schema}::regnamespace
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid and i.indisvalid and i.indpred is null
          and i.indnkeyatts >= cardinality(c.conkey)
          and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] @> c.conkey
          and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] <@ c.conkey
      )
    order by 1, 2`.execute(trx);
  return rows;
}

/**
 * The keys of 0002 that no index covers by the rule above, as found by #657: each has an
 * index on its first column only (placement_pkey, placement_ride_idx,
 * ride_driver_leg_unique), a uuid that narrows a lookup to a few rows. Listed so that
 * any other key without an index fails, and so that an index added for one of these
 * fails too until it leaves the list.
 */
const KNOWN_GAPS: ForeignKey[] = [
  { table: "placement", name: "placement_person_fk", columns: ["person_id", "event_id"] },
  { table: "placement", name: "placement_ride_fk", columns: ["ride_id", "event_id", "leg"] },
  { table: "ride", name: "ride_driver_fk", columns: ["driver_id", "event_id"] },
];

/** A schema of its own, in the rolled-back transaction: no lock on the real tables. */
const FIXTURE = "fk_index_fixture";

/** A parent with a two-column key, and a child referencing it, without any index. */
async function fixture(trx: Trx) {
  await sql`create schema ${sql.id(FIXTURE)}`.execute(trx);
  await sql`
    create table ${sql.id(FIXTURE, "parent")} (
      id int, scope int, primary key (id, scope))`.execute(trx);
  await sql`
    create table ${sql.id(FIXTURE, "child")} (
      id int primary key, parent_id int, scope int, other int,
      constraint child_parent_fk foreign key (parent_id, scope)
        references ${sql.id(FIXTURE, "parent")} (id, scope))`.execute(trx);
}

async function uncoveredWith(index: RawBuilder<unknown> | null) {
  return withRollback(async (trx) => {
    await fixture(trx);
    if (index) await sql`create index on ${sql.id(FIXTURE, "child")} ${index}`.execute(trx);
    return (await uncoveredForeignKeys(trx, FIXTURE)).map((key) => key.name);
  });
}

describe("foreign key indexes", () => {
  it.each([
    ["no index", null],
    ["an index on part of its columns", sql`(parent_id)`],
    ["an index where its columns do not lead", sql`(other, parent_id, scope)`],
    ["an index with another column between them", sql`(parent_id, other, scope)`],
    ["a partial index", sql`(parent_id, scope) where other is null`],
  ])("finds a key with %s uncovered", async (_, index) => {
    expect(await uncoveredWith(index)).toEqual(["child_parent_fk"]);
  });

  it.each([
    ["an index on its columns", sql`(parent_id, scope)`],
    ["an index on its columns in another order", sql`(scope, parent_id)`],
    ["an index led by its columns", sql`(parent_id, scope, other)`],
  ])("finds a key with %s covered", async (_, index) => {
    expect(await uncoveredWith(index)).toEqual([]);
  });

  it("finds the foreign keys of the schema", async () => {
    const keys = await withRollback((trx) => foreignKeys(trx, "public"));
    expect(keys).toContainEqual({
      table: "email_link",
      name: "email_link_return_event_fk",
      columns: ["return_event_id"],
    });
    expect(keys).toContainEqual({
      table: "placement",
      name: "placement_ride_fk",
      columns: ["ride_id", "event_id", "leg"],
    });
  });

  it("every foreign key is covered by an index, but the known gaps", async () => {
    expect(await withRollback((trx) => uncoveredForeignKeys(trx, "public"))).toEqual(KNOWN_GAPS);
  });
});
