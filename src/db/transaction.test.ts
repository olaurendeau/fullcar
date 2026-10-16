import { describe, expect, it } from "vitest";
import { getDb } from "./client";
import { withCommittedEvent } from "./test-committed";
import { withRollback } from "./test-db";
import { seedPerson } from "./test-participants";
import { atomically } from "./transaction";

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
