import { sql } from "kysely";
import { describe, expect, it } from "vitest";
import { getDb } from "./client";
import { resetSchema } from "./test-setup";

describe("resetSchema", () => {
  it("refuses a database other than the one it was told to empty", async () => {
    await expect(resetSchema(getDb(), "fullcar_migrations_test")).rejects.toThrow(
      'refusing to empty "fullcar_test": expected "fullcar_migrations_test"',
    );
    const { rows } = await sql<{ found: string | null }>`
      select to_regclass('public.kysely_migration')::text as found`.execute(getDb());
    expect(rows[0]?.found).not.toBeNull();
  });
});
