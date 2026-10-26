import { describe, expect, it } from "vitest";
import { accountForEmail, findAccount, findAccountByEmail } from "./accounts";
import { anAddress, seedAccount } from "./test-accounts";
import { withRollback } from "./test-db";

describe("findAccountByEmail and findAccount", () => {
  it("give the account of the address or the id, with its language and its last visit", async () => {
    await withRollback(async (trx) => {
      const email = anAddress();
      const lastVisitAt = new Date("2026-01-02T03:04:05.000Z");
      const id = await seedAccount(trx, { email, locale: "en", last_visit_at: lastVisitAt });
      const account = { id, email, locale: "en", lastVisitAt, warnedAt: null };
      expect(await findAccountByEmail(trx, email)).toEqual(account);
      expect(await findAccount(trx, id)).toEqual(account);
    });
  });

  // OA3.5: a sign-in request for an address without an account creates none.
  it("give nothing for an address without an account, or an unknown id", async () => {
    await withRollback(async (trx) => {
      expect(await findAccountByEmail(trx, anAddress())).toBeUndefined();
      expect(await findAccount(trx, "00000000-0000-4000-8000-000000000000")).toBeUndefined();
    });
  });
});

describe("accountForEmail", () => {
  it("creates the account of a new address in the language given, and gives an existing one unchanged", async () => {
    await withRollback(async (trx) => {
      const email = anAddress();
      const created = await accountForEmail(trx, email, "en");
      expect(created).toMatchObject({ email, locale: "en", warnedAt: null });
      expect(await accountForEmail(trx, email, "fr")).toEqual(created);
      const rows = await trx.selectFrom("account").select("id").where("email", "=", email).execute();
      expect(rows).toEqual([{ id: created.id }]);
    });
  });
});
