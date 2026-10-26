import { expect, it } from "vitest";
import { getDb } from "./client";
import { seedAccount, seedSends, withCommittedAddresses } from "./test-accounts";

// A send left committed would count in the global cap of every later test.
it("withCommittedAddresses deletes the accounts and sends of its addresses, even when the callback throws", async () => {
  const failure = new Error("boom");
  let email = "";
  await expect(
    withCommittedAddresses(async (db, address) => {
      email = address();
      await seedAccount(db, { email });
      await seedSends(db, 2, { kind: "login", email });
      throw failure;
    }),
  ).rejects.toBe(failure);
  const db = getDb();
  expect(await db.selectFrom("account").select("id").where("email", "=", email).execute()).toEqual([]);
  expect(await db.selectFrom("email_send").select("id").where("email", "=", email).execute()).toEqual([]);
});
