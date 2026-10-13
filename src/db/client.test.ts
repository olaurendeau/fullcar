import { sql } from "kysely";
import pg from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPool, getDb, POOL_ERROR_MESSAGE } from "./client";
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

  it("leave the global parsers of pg untouched", () => {
    // Set on the pool, not on pg.types: any other client in the process keeps its parsers.
    expect(pg.types.getTypeParser(1082, "text")("2026-12-12")).toBeInstanceOf(Date);
    expect(pg.types.getTypeParser(1114, "text")("2026-12-12 07:30:00")).toBeInstanceOf(Date);
  });
});

describe("pool", () => {
  it("closes idle connections after an explicit delay", async () => {
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
});
