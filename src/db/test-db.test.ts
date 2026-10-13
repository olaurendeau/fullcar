import { sql } from "kysely";
import { describe, expect, it } from "vitest";
import { getDb } from "./client";
import { migrations } from "./migrations";
import { withRollback } from "./test-db";

async function tableExists(name: string): Promise<boolean> {
  const { rows } = await sql<{ found: string | null }>`
    select to_regclass(${`public.${name}`})::text as found`.execute(getDb());
  return rows[0]?.found != null;
}

describe("test database", () => {
  it("is the one getDb() reaches under Vitest", async () => {
    const { rows } = await sql<{ name: string }>`
      select current_database() as name`.execute(getDb());
    expect(rows[0]?.name).toBe("fullcar_test");
  });

  it("is migrated to the latest version before the tests run", async () => {
    const { rows } = await sql<{ name: string }>`
      select name from kysely_migration order by name`.execute(getDb());
    expect(rows.map((row) => row.name)).toEqual(Object.keys(migrations).sort());
  });
});

describe("withRollback", () => {
  it("undoes what was written inside it", async () => {
    await withRollback(async (trx) => {
      await sql`create table rollback_probe (id int)`.execute(trx);
      await sql`insert into rollback_probe values (1)`.execute(trx);
    });
    expect(await tableExists("rollback_probe")).toBe(false);
  });

  it("returns what the callback returns", async () => {
    const value = await withRollback(async (trx) => {
      const { rows } = await sql<{ n: number }>`select 1 as n`.execute(trx);
      return rows[0]?.n;
    });
    expect(value).toBe(1);
  });

  it("rolls back and rethrows when the callback throws", async () => {
    const failure = new Error("boom");
    await expect(
      withRollback(async (trx) => {
        await sql`create table rollback_throw_probe (id int)`.execute(trx);
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(await tableExists("rollback_throw_probe")).toBe(false);
  });
});
