import { Command, ControlledTransaction, sql, type Kysely, type Transaction } from "kysely";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDb, getDb } from "./client";
import { migrations } from "./migrations";
import type { Database } from "./schema";
import { withRollback } from "./test-db";

async function tableExists(name: string): Promise<boolean> {
  const { rows } = await sql<{ found: string | null }>`
    select to_regclass(${`public.${name}`})::text as found`.execute(getDb());
  return rows[0]?.found != null;
}

async function backendPid(trx: Transaction<Database>): Promise<number> {
  const { rows } = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(trx);
  return rows[0]!.pid;
}

// A pool of its own: getDb() would hand back the very session being observed once released.
let observer: Kysely<Database>;
beforeAll(() => {
  observer = createDb(process.env.DATABASE_URL!);
});
afterAll(async () => {
  await observer?.destroy();
});

/** The session's state seen from outside: "idle" once its transaction has ended. */
async function sessionState(pid: number): Promise<string | undefined> {
  const { rows } = await sql<{ state: string }>`
    select state from pg_stat_activity where pid = ${pid}`.execute(observer);
  return rows[0]?.state;
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

// Uncommitted work is invisible from another connection whether the transaction was
// rolled back or left open: the session's state is what tells the two apart.
describe("withRollback", () => {
  it("ends its transaction by undoing what was written inside it", async () => {
    let pid = 0;
    await withRollback(async (trx) => {
      pid = await backendPid(trx);
      await sql`create table rollback_probe (id int)`.execute(trx);
      await sql`insert into rollback_probe values (1)`.execute(trx);
    });
    expect(await sessionState(pid)).toBe("idle");
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
    let pid = 0;
    await expect(
      withRollback(async (trx) => {
        pid = await backendPid(trx);
        await sql`create table rollback_throw_probe (id int)`.execute(trx);
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(await sessionState(pid)).toBe("idle");
    expect(await tableExists("rollback_throw_probe")).toBe(false);
  });

  it("keeps the callback's error when the rollback fails too", async () => {
    const rollback = ControlledTransaction.prototype.rollback;
    // Rolls back for real, so no connection is left open, then reports a failure.
    const spy = vi
      .spyOn(ControlledTransaction.prototype, "rollback")
      .mockImplementationOnce(function (this: ControlledTransaction<Database>) {
        const real = rollback.call(this);
        return new Command(async () => {
          await real.execute();
          throw new Error("rollback failed");
        });
      });
    const failure = new Error("boom");
    try {
      await expect(
        withRollback(async () => {
          throw failure;
        }),
      ).rejects.toBe(failure);
    } finally {
      spy.mockRestore();
    }
  });
});
