import { sql, type Transaction } from "kysely";
import { describe, expect, it } from "vitest";
import type { Database } from "./schema";
import { withRollback } from "./test-db";

const HASH = Buffer.alloc(32, 7);

function anEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "Ab3dEf7h",
    title: "Tournoi de Rennes",
    location: "Gymnase des Gayeulles",
    aller_at: "2026-12-12 07:30:00",
    admin_token_hash: HASH,
    ...overrides,
  };
}

async function insert(trx: Transaction<Database>, overrides: Record<string, unknown> = {}) {
  await trx.insertInto("event").values(anEvent(overrides)).execute();
}

/** The insert is refused, and by the constraint named: not by some other one. */
async function expectRefusedBy(overrides: Record<string, unknown>, constraint: string) {
  await expect(withRollback((trx) => insert(trx, overrides))).rejects.toMatchObject({
    constraint,
  });
}

describe("event table", () => {
  // C8.6: what the glossary lists, plus the technical timestamp, and nothing else.
  it("has exactly the columns of an Event", async () => {
    const { rows } = await withRollback((trx) =>
      sql<{ name: string; type: string; nullable: string; default: string | null }>`
        select column_name as name, data_type as type, is_nullable as nullable,
               column_default as default
        from information_schema.columns
        where table_schema = 'public' and table_name = 'event'
        order by ordinal_position`.execute(trx),
    );
    expect(rows).toEqual([
      { name: "id", type: "text", nullable: "NO", default: null },
      { name: "title", type: "text", nullable: "NO", default: null },
      { name: "location", type: "text", nullable: "NO", default: null },
      { name: "aller_at", type: "timestamp without time zone", nullable: "NO", default: null },
      { name: "retour_at", type: "timestamp without time zone", nullable: "YES", default: null },
      { name: "boosters_enabled", type: "boolean", nullable: "NO", default: "false" },
      { name: "participation_enabled", type: "boolean", nullable: "NO", default: "false" },
      { name: "stops_enabled", type: "boolean", nullable: "NO", default: "false" },
      { name: "admin_token_hash", type: "bytea", nullable: "NO", default: null },
      { name: "created_at", type: "timestamp with time zone", nullable: "NO", default: "now()" },
    ]);
  });

  it("keeps the times to the second, without time zone", async () => {
    const { rows } = await withRollback((trx) =>
      sql<{ name: string; precision: number }>`
        select column_name as name, datetime_precision as precision
        from information_schema.columns
        where table_schema = 'public' and table_name = 'event'
          and column_name in ('aller_at', 'retour_at')
        order by column_name`.execute(trx),
    );
    expect(rows).toEqual([
      { name: "aller_at", precision: 0 },
      { name: "retour_at", precision: 0 },
    ]);
  });

  it("is keyed by its id", async () => {
    await expect(
      withRollback(async (trx) => {
        await insert(trx);
        await insert(trx);
      }),
    ).rejects.toMatchObject({ constraint: "event_pkey" });
  });

  it("gives back the times as the exact strings written, options off by default", async () => {
    const row = await withRollback(async (trx) => {
      await insert(trx, { retour_at: "2026-12-12 18:00:00" });
      return trx.selectFrom("event").selectAll().executeTakeFirstOrThrow();
    });
    expect(row).toMatchObject({
      aller_at: "2026-12-12 07:30:00",
      retour_at: "2026-12-12 18:00:00",
      boosters_enabled: false,
      participation_enabled: false,
      stops_enabled: false,
    });
    expect(row.admin_token_hash).toEqual(HASH);
    expect(row.created_at).toBeInstanceOf(Date);
  });

  it("accepts an event without retour", async () => {
    const row = await withRollback(async (trx) => {
      await insert(trx, { retour_at: null });
      return trx.selectFrom("event").select("retour_at").executeTakeFirstOrThrow();
    });
    expect(row.retour_at).toBeNull();
  });

  // Kysely's types forbid writing created_at at all: plain SQL is the only way to try.
  it("refuses an explicit null creation time", async () => {
    await expect(
      withRollback((trx) =>
        sql`
          insert into event (id, title, location, aller_at, admin_token_hash, created_at)
          values ('Ab3dEf7h', 'Tournoi', 'Gymnase', '2026-12-12 07:30:00', ${HASH}, null)`.execute(
          trx,
        ),
      ),
    ).rejects.toMatchObject({ code: "23502", column: "created_at" });
  });

  it.each([
    ["too short", "Ab3dEf7"],
    ["too long", "Ab3dEf7hj"],
    ["with an ambiguous 0", "Ab3dEf70"],
    ["with an ambiguous O", "Ab3dEf7O"],
    ["with an ambiguous 1", "Ab3dEf71"],
    ["with an ambiguous l", "Ab3dEf7l"],
    ["with an ambiguous I", "Ab3dEf7I"],
    ["with a symbol", "Ab3dEf7-"],
  ])("refuses an id %s", async (_, id) => {
    await expectRefusedBy({ id }, "event_id_format");
  });

  it.each([
    ["at the same time as the aller", "2026-12-12 07:30:00"],
    ["before the aller", "2026-12-12 07:29:59"],
  ])("refuses a retour %s", async (_, retour_at) => {
    await expectRefusedBy({ retour_at }, "event_retour_after_aller");
  });

  it.each([
    ["31", 31],
    ["33", 33],
    ["0", 0],
  ])("refuses a token hash of %s bytes", async (_, size) => {
    await expectRefusedBy({ admin_token_hash: Buffer.alloc(size, 7) }, "event_admin_token_hash_length");
  });

  // Counted in code points, as the domain does: a car emoji is one, though two UTF-16 units.
  it.each([
    ["title", 80, "event_title_length"],
    ["location", 120, "event_location_length"],
  ])("accepts a %s of %i code points and refuses one more, or none", async (column, max, constraint) => {
    const row = await withRollback(async (trx) => {
      await insert(trx, { [column]: "🚗".repeat(max) });
      return trx.selectFrom("event").select(["title", "location"]).executeTakeFirstOrThrow();
    });
    expect(row[column as "title" | "location"]).toBe("🚗".repeat(max));
    await expectRefusedBy({ [column]: "🚗".repeat(max + 1) }, constraint);
    await expectRefusedBy({ [column]: "" }, constraint);
  });
});
