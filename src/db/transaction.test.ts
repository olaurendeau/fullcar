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

  it("refuses a transaction in READ COMMITTED, where each read would see its own snapshot", async () => {
    let reached = false;
    await expect(
      atomically(getDb(), (trx) =>
        onOneSnapshot(trx, async () => {
          reached = true;
        }),
      ),
    ).rejects.toThrow("onOneSnapshot: the transaction given is in read committed, not repeatable read");
    expect(reached).toBe(false);
  });

  it("reads inside a SERIALIZABLE transaction, which holds one snapshot too", async () => {
    const seen = await getDb()
      .transaction()
      .setIsolationLevel("serializable")
      .execute(async (trx) => (await onOneSnapshot(trx, async (db) => db)) === trx);
    expect(seen).toBe(true);
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
