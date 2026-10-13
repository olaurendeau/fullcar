import { sql } from "kysely";
import pg from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDb, createPool, getDb, POOL_ERROR_MESSAGE } from "./client";
import { withRollback } from "./test-db";

afterEach(() => {
  vi.restoreAllMocks();
});

// A date or a timestamp without time zone is a calendar value: parsed into a JS Date,
// it would be shifted by the time zone of whichever server reads it.
describe("date and timestamp columns", () => {
  it("come back as the string written, not as a Date", async () => {
    const { rows } = await withRollback((trx) =>
      sql<{ day: unknown; at: unknown }>`
        select '2026-12-12'::date as day, '2026-12-12 07:30:00'::timestamp as at`.execute(trx),
    );
    expect(rows[0]).toEqual({ day: "2026-12-12", at: "2026-12-12 07:30:00" });
  });

  it("come back as arrays of the strings written", async () => {
    const { rows } = await withRollback((trx) =>
      sql<{ days: unknown; ats: unknown }>`
        select array_agg(day order by day) as days, array_agg(at order by at) as ats
        from (values ('2026-12-12'::date, '2026-12-12 07:30:00'::timestamp),
                     ('2026-12-13'::date, '2026-12-13 18:00:00'::timestamp)) as v(day, at)`.execute(
        trx,
      ),
    );
    expect(rows[0]).toEqual({
      days: ["2026-12-12", "2026-12-13"],
      ats: ["2026-12-12 07:30:00", "2026-12-13 18:00:00"],
    });
  });

  it("leave the global parsers of pg untouched", () => {
    // Set on the pool, not on pg.types: any other client in the process keeps its parsers.
    expect(pg.types.getTypeParser(1082, "text")("2026-12-12")).toBeInstanceOf(Date);
    expect(pg.types.getTypeParser(1114, "text")("2026-12-12 07:30:00")).toBeInstanceOf(Date);
    // pg's TypeId lists scalar types only: an array's OID is cast.
    const arrayParser = (oid: number) =>
      pg.types.getTypeParser(oid as Parameters<typeof pg.types.getTypeParser>[0], "text");
    expect(arrayParser(1182)("{2026-12-12}")).toEqual([expect.any(Date)]);
    expect(arrayParser(1115)('{"2026-12-12 07:30:00"}')).toEqual([expect.any(Date)]);
  });
});

describe("pool", () => {
  it("sets an explicit idle timeout of 5 s", async () => {
    const pool = createPool("postgres://db/unused");
    try {
      expect(pool.options.idleTimeoutMillis).toBe(5_000);
    } finally {
      await pool.end();
    }
  });

  it("survives an idle connection killed by the server, and serves the next query", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    // The transaction holds one connection; getDb() then opens a second one, left idle.
    await withRollback(async (trx) => {
      const { rows } = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(getDb());
      await sql`select pg_terminate_backend(${rows[0]!.pid})`.execute(trx);
      await vi.waitFor(() => expect(log).toHaveBeenCalled());
    });

    // A fixed message only: the error may carry a query or a connection string.
    expect(log.mock.calls).toEqual([[POOL_ERROR_MESSAGE]]);
    const { rows } = await sql<{ n: number }>`select 1 as n`.execute(getDb());
    expect(rows[0]?.n).toBe(1);
  });

  it("survives a connection killed in the middle of a transaction, and serves the next query", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    // A pool of its own, destroyed below: the killed connection cannot reach another test.
    const db = createDb(process.env.DATABASE_URL!);
    try {
      // Unlike withRollback, transaction() releases its connection even when the rollback
      // fails on a dead one, so the pool can end.
      const transaction = db.transaction().execute(async (trx) => {
        const { rows } = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(trx);
        // Killed from a second connection, between two queries of the transaction.
        await sql`select pg_terminate_backend(${rows[0]!.pid})`.execute(db);
        await vi.waitFor(() => expect(log).toHaveBeenCalled(), { timeout: 3_000 });
        await sql`select 1`.execute(trx);
      });

      await expect(transaction).rejects.toThrow();
      // A fixed message only, once: the error may carry a query or a connection string.
      expect(log.mock.calls).toEqual([[POOL_ERROR_MESSAGE]]);
      const { rows } = await sql<{ n: number }>`select 1 as n`.execute(db);
      expect(rows[0]?.n).toBe(1);
    } finally {
      await db.destroy();
    }
  });
});
