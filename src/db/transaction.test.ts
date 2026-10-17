import { sql } from "kysely";
import { describe, expect, it } from "vitest";
import { getDb } from "./client";
import { withCommittedEvent } from "./test-committed";
import { withRollback } from "./test-db";
import { seedPerson } from "./test-participants";
import { atomically, onOneSnapshot } from "./transaction";

describe("atomically", () => {
  it("runs inside the transaction it is given, without opening another", async () => {
    await withRollback(async (trx) => {
      const seen = await atomically(trx, async (db) => db);
      expect(seen).toBe(trx);
    });
  });

  it("opens a transaction on a connection, and commits what it wrote", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const id = await atomically(db, async (trx) => {
        expect(trx.isTransaction).toBe(true);
        return (await seedPerson(trx, eventId)).id;
      });
      const row = await getDb().selectFrom("person").select("id").where("id", "=", id).executeTakeFirst();
      expect(row).toEqual({ id });
    });
  });

  it("rolls everything back, and rethrows, when the function fails", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const failure = new Error("boom");
      let id = "";
      await expect(
        atomically(db, async (trx) => {
          id = (await seedPerson(trx, eventId)).id;
          throw failure;
        }),
      ).rejects.toBe(failure);
      expect(id).not.toBe("");
      const row = await db.selectFrom("person").select("id").where("id", "=", id).executeTakeFirst();
      expect(row).toBeUndefined();
    });
  });
});

describe("onOneSnapshot", () => {
  it("reads inside the transaction it is given, without opening another", async () => {
    await withRollback(async (trx) => {
      const seen = await onOneSnapshot(trx, async (db) => db);
      expect(seen).toBe(trx);
    });
  });

  it("opens a read-only transaction in REPEATABLE READ on a connection", async () => {
    const settings = await onOneSnapshot(getDb(), async (trx) => {
      expect(trx.isTransaction).toBe(true);
      const { rows } = await sql<{ isolation: string; readOnly: string }>`
        select current_setting('transaction_isolation') as isolation,
               current_setting('transaction_read_only') as "readOnly"`.execute(trx);
      return rows[0];
    });
    expect(settings).toEqual({ isolation: "repeatable read", readOnly: "on" });
  });
});
