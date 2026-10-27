import { sql, type Transaction } from "kysely";
import { describe, expect, it } from "vitest";
import { SESSION_LIFETIME_MS } from "@/domain/account-rules";
import { decideOrganiserAccess } from "@/domain/organiser-access";
import { accountForEmail, deleteAccount, eraseAccount, findAccount, findAccountByEmail } from "./accounts";
import { readAdminTokenHash, readOrganiserAccessEvent } from "./events";
import type { Database } from "./schema";
import { closeSession, findSession } from "./sessions";
import { anAddress, seedAccount, seedLink, seedSends, seedSession, withCommittedAddresses, withRollbackRecordingSends } from "./test-accounts";
import { withRollback } from "./test-db";
import { seedEvent, seedPendingSend } from "./test-events";
import { seedPerson } from "./test-participants";

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

/** The event confirmed by `accountId`, as a used confirmation link leaves it; anonymised if asked. */
async function confirmedBy(trx: Transaction<Database>, accountId: string, anonymise = false) {
  const event = await seedEvent(trx);
  await trx.updateTable("event").set({ account_id: accountId, confirmed_at: new Date() }).where("id", "=", event.id).execute();
  if (anonymise) {
    await trx.updateTable("event").set({ admin_token_hash: null, anonymised_at: new Date() }).where("id", "=", event.id).execute();
  }
  return event;
}

describe("deleteAccount (OA9.3 to OA9.5)", () => {
  it("deletes the account of the session and all its sessions, and leaves another account as it was", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const accountId = await seedAccount(trx);
      const session = await seedSession(trx, accountId);
      const elsewhere = await seedSession(trx, accountId);
      const other = await seedAccount(trx);
      const otherSession = await seedSession(trx, other);

      expect(await deleteAccount(trx, session, [])).toBe(true);

      expect(await findAccount(trx, accountId)).toBeUndefined();
      expect(await findSession(trx, session)).toBeUndefined();
      expect(await findSession(trx, elsewhere)).toBeUndefined();
      expect(await findAccount(trx, other)).toBeDefined();
      expect(await findSession(trx, otherSession)).toBeDefined();
    });
  });

  // OA9.5: the events not yet anonymised stay open, with no organiser, and no token opens them.
  it("leaves its open events to their participants, without account and without admin token: orphans for every visitor", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const accountId = await seedAccount(trx);
      const session = await seedSession(trx, accountId);
      const open = await confirmedBy(trx, accountId);
      const person = await seedPerson(trx, open.id);

      await deleteAccount(trx, session, []);

      const row = await trx.selectFrom("event").select(["account_id", "admin_token_hash"]).where("id", "=", open.id).executeTakeFirstOrThrow();
      expect(row).toEqual({ account_id: null, admin_token_hash: null });
      const event = (await readOrganiserAccessEvent(trx, open.id))!;
      expect(decideOrganiserAccess(event, { adminToken: open.token, account: undefined })).toEqual({ state: "orphan" });
      expect(await trx.selectFrom("person").select("id").where("event_id", "=", open.id).execute()).toEqual([{ id: person.id }]);
    });
  });

  it("deletes its anonymised events, which answer « Événement introuvable »", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const accountId = await seedAccount(trx);
      const session = await seedSession(trx, accountId);
      const ended = await confirmedBy(trx, accountId, true);
      const open = await confirmedBy(trx, accountId);

      await deleteAccount(trx, session, []);

      expect(await readOrganiserAccessEvent(trx, ended.id)).toBeUndefined();
      expect(await readOrganiserAccessEvent(trx, open.id)).toBeDefined();
    });
  });

  // OA9.5 in the strict sense (decision 4 on #581): the address is in no table any more.
  it("erases the address from every table: its sends, its sign-in links, and the pending events created elsewhere with it", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const email = anAddress();
      const accountId = await seedAccount(trx, { email });
      const session = await seedSession(trx, accountId);
      await seedLink(trx, { kind: "login", accountId, returnEventId: null });
      await seedSends(trx, 2, { kind: "login", email });
      const pending = await seedEvent(trx);
      await seedPendingSend(trx, pending.id, { email, status: "sent" });
      await seedLink(trx, { kind: "confirmation", eventId: pending.id });
      const someoneElse = await seedEvent(trx);
      const otherEmail = anAddress();
      await seedPendingSend(trx, someoneElse.id, { email: otherEmail, status: "sent" });
      await seedSends(trx, 1, { kind: "login", email: otherEmail });

      await deleteAccount(trx, session, []);

      expect(await trx.selectFrom("email_send").select("id").where("email", "=", email).execute()).toEqual([]);
      expect(await trx.selectFrom("email_send").select("id").where("email", "=", otherEmail).execute()).toHaveLength(1);
      expect(await trx.selectFrom("email_link").select("token_hash").where("account_id", "=", accountId).execute()).toEqual([]);
      // The pending event stays, with no address, and no link that would confirm one.
      const row = await trx.selectFrom("event").select(["pending_email", "confirmed_at"]).where("id", "=", pending.id).executeTakeFirstOrThrow();
      expect(row).toEqual({ pending_email: null, confirmed_at: null });
      expect(await trx.selectFrom("email_link").select("token_hash").where("event_id", "=", pending.id).execute()).toEqual([]);
      const kept = await trx.selectFrom("event").select("pending_email").where("id", "=", someoneElse.id).executeTakeFirstOrThrow();
      expect(kept.pending_email).toBe(otherEmail);
      // The address is in no row of the tables that held it.
      for (const table of ["account", "event", "email_send", "email_link", "session"] as const) {
        const { rows } = await sql<{ found: number }>`
          select count(*)::int as found from ${sql.table(table)} t where t::text like ${"%" + email + "%"}`.execute(trx);
        expect(rows[0]!.found, table).toBe(0);
      }
    });
  });

  it("revokes the admin tokens the browser sends, and only those", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const accountId = await seedAccount(trx);
      const session = await seedSession(trx, accountId);
      const kept = await seedEvent(trx);
      const pending = await seedEvent(trx);

      await deleteAccount(trx, session, [pending.token, 42, null]);

      expect(await readAdminTokenHash(trx, pending.id)).toBeNull();
      expect(await readAdminTokenHash(trx, kept.id)).not.toBeNull();
    });
  });

  it.each([
    ["an unknown token", "inconnu"],
    ["a value that is no token", 42],
  ])("deletes nothing for %s", async (_, token) => {
    await withRollbackRecordingSends(async (trx) => {
      const accountId = await seedAccount(trx);
      await seedSession(trx, accountId);
      expect(await deleteAccount(trx, token, [])).toBe(false);
      expect(await findAccount(trx, accountId)).toBeDefined();
    });
  });

  it("deletes nothing for a session ended 90 days after its last visit", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const accountId = await seedAccount(trx);
      const old = await seedSession(trx, accountId, { lastVisitAt: new Date(Date.now() - SESSION_LIFETIME_MS - 1000) });
      const open = await confirmedBy(trx, accountId);
      expect(await deleteAccount(trx, old, [])).toBe(false);
      expect(await findAccount(trx, accountId)).toBeDefined();
      expect(await readAdminTokenHash(trx, open.id)).not.toBeNull();
    });
  });

  // OA9.4: all or nothing. The account's own deletion, the last step, fails.
  it("is all or nothing: a failure on the last step leaves the account, its sessions and its events as they were", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const accountId = await seedAccount(trx);
      const session = await seedSession(trx, accountId);
      const open = await confirmedBy(trx, accountId);
      await sql`create function pg_temp.refuse() returns trigger language plpgsql as $$ begin raise exception 'refused'; end $$`.execute(trx);
      await sql`create trigger refuse_delete before delete on account for each row execute function pg_temp.refuse()`.execute(trx);
      await sql`savepoint before_delete`.execute(trx);
      await expect(deleteAccount(trx, session, [])).rejects.toThrow("refused");
      await sql`rollback to savepoint before_delete`.execute(trx);
      expect(await findAccount(trx, accountId)).toBeDefined();
      expect(await findSession(trx, session)).toBeDefined();
      expect(await readAdminTokenHash(trx, open.id)).not.toBeNull();
    });
  });
});

describe("eraseAccount", () => {
  it("erases an account by its id, with no session to show (the inactivity deletion of #611), once", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const accountId = await seedAccount(trx);
      expect(await eraseAccount(trx, accountId, [])).toBe(true);
      expect(await findAccount(trx, accountId)).toBeUndefined();
      expect(await eraseAccount(trx, accountId, [])).toBe(false);
    });
  });
});

describe("deleteAccount, concurrently", () => {
  // Two tabs, two sessions of one account: one deletes it, the other finds it gone, and none deadlocks (40P01).
  it("lets two deletions of one account run together: one deletes, the other finds nothing to delete", async () => {
    await withCommittedAddresses(async (db, address) => {
      const accountId = await seedAccount(db, { email: address() });
      const first = await seedSession(db, accountId);
      const second = await seedSession(db, accountId);
      const results = await Promise.all([deleteAccount(db, first, []), deleteAccount(db, second, [])]);
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await findAccount(db, accountId)).toBeUndefined();
    });
  });

  // The sign-out of a session and the deletion of its account both take the session first, then the events.
  it("lets the sign-out of another session run beside it", async () => {
    await withCommittedAddresses(async (db, address) => {
      const accountId = await seedAccount(db, { email: address() });
      const first = await seedSession(db, accountId);
      const second = await seedSession(db, accountId);
      const results = await Promise.all([deleteAccount(db, first, []), closeSession(db, second)]);
      expect(results[0]).toBe(true);
      expect(await findAccount(db, accountId)).toBeUndefined();
    });
  });
});
