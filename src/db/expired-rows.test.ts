import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import type { Database } from "./schema";
import { anAddress, seedAccount, seedLink, seedSends, seedSession } from "./test-accounts";
import { withRollback } from "./test-db";
import { confirmSeededEvent, seedEvent } from "./test-events";
import { tokenKey } from "./token-key";
import { deleteExpiredRows } from "./expired-rows";

type Db = Kysely<Database>;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Long before any row another test writes: a run at this instant takes nothing but the rows
// of this file, even those another file commits at the same time.
const NOW = new Date("1999-06-01T00:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

async function sessionExists(db: Db, token: string): Promise<boolean> {
  const row = await db.selectFrom("session").select("account_id").where("token_hash", "=", tokenKey(token)!).executeTakeFirst();
  return row !== undefined;
}

async function linkExists(db: Db, token: string): Promise<boolean> {
  const row = await db.selectFrom("email_link").select("kind").where("token_hash", "=", tokenKey(token)!).executeTakeFirst();
  return row !== undefined;
}

async function sendsTo(db: Db, email: string): Promise<number> {
  const rows = await db.selectFrom("email_send").select("id").where("email", "=", email).execute();
  return rows.length;
}

describe("a session", () => {
  it("is deleted once it has ended, 90 days after its last visit, and kept the millisecond before", async () => {
    await withRollback(async (trx) => {
      const accountId = await seedAccount(trx);
      const ended = await seedSession(trx, accountId, { createdAt: ago(200 * DAY), lastVisitAt: ago(90 * DAY) });
      const alive = await seedSession(trx, accountId, { createdAt: ago(200 * DAY), lastVisitAt: ago(90 * DAY - 1) });

      expect(await deleteExpiredRows(trx, NOW)).toEqual({ sessions: 1, links: 0, sends: 0 });

      expect(await sessionExists(trx, ended)).toBe(false);
      expect(await sessionExists(trx, alive)).toBe(true);
    });
  });
});

describe("a send", () => {
  it("is deleted once out of the hour of the limits, and kept while it still counts", async () => {
    await withRollback(async (trx) => {
      const out = anAddress();
      const counted = anAddress();
      await seedSends(trx, 2, { kind: "login", email: out, sentAt: ago(HOUR) });
      await seedSends(trx, 1, { kind: "login", email: counted, sentAt: ago(HOUR - 1) });

      expect(await deleteExpiredRows(trx, NOW)).toEqual({ sessions: 0, links: 0, sends: 2 });

      expect(await sendsTo(trx, out)).toBe(0);
      expect(await sendsTo(trx, counted)).toBe(1);
    });
  });

  it("is deleted with its address, that of a confirmation email included", async () => {
    await withRollback(async (trx) => {
      const { id } = await seedEvent(trx);
      const email = anAddress();
      await seedSends(trx, 1, { kind: "confirmation", email, eventId: id, sentAt: ago(DAY) });

      expect(await deleteExpiredRows(trx, NOW)).toEqual({ sessions: 0, links: 0, sends: 1 });
      expect(await sendsTo(trx, email)).toBe(0);
    });
  });
});

describe("a link", () => {
  it("is kept 30 days after its expiry: a sign-in link 30 days and 1 hour, the confirmation link of a confirmed event 37 days", async () => {
    await withRollback(async (trx) => {
      const accountId = await seedAccount(trx);
      const { id } = await seedEvent(trx);
      await confirmSeededEvent(trx, id);
      const login = { kind: "login", accountId, returnEventId: null } as const;
      const confirmation = { kind: "confirmation", eventId: id } as const;
      const loginGone = await seedLink(trx, login, { createdAt: ago(30 * DAY + HOUR) });
      const loginKept = await seedLink(trx, login, { createdAt: ago(30 * DAY + HOUR - 1) });
      const confirmationGone = await seedLink(trx, confirmation, { createdAt: ago(37 * DAY) });
      const confirmationKept = await seedLink(trx, confirmation, { createdAt: ago(37 * DAY - 1) });

      expect(await deleteExpiredRows(trx, NOW)).toEqual({ sessions: 0, links: 2, sends: 0 });

      expect(await linkExists(trx, loginGone)).toBe(false);
      expect(await linkExists(trx, loginKept)).toBe(true);
      expect(await linkExists(trx, confirmationGone)).toBe(false);
      expect(await linkExists(trx, confirmationKept)).toBe(true);
    });
  });

  it("used, goes on the same day as unused: « Ce lien a déjà servi » until then", async () => {
    await withRollback(async (trx) => {
      const accountId = await seedAccount(trx);
      const login = { kind: "login", accountId, returnEventId: null } as const;
      const gone = await seedLink(trx, login, { createdAt: ago(30 * DAY + HOUR), usedAt: ago(30 * DAY + HOUR - MINUTE) });
      const kept = await seedLink(trx, login, { createdAt: ago(DAY), usedAt: ago(DAY - MINUTE) });

      expect(await deleteExpiredRows(trx, NOW)).toEqual({ sessions: 0, links: 1, sends: 0 });

      expect(await linkExists(trx, gone)).toBe(false);
      expect(await linkExists(trx, kept)).toBe(true);
    });
  });

  // OA5.6, OA7.7: an expired confirmation link still sends a new one while its event waits.
  it("of confirmation stays while its event is pending, however old, and goes once the event is confirmed", async () => {
    await withRollback(async (trx) => {
      const { id } = await seedEvent(trx);
      const expired = await seedLink(trx, { kind: "confirmation", eventId: id }, { createdAt: ago(400 * DAY) });
      const used = await seedLink(trx, { kind: "confirmation", eventId: id }, { createdAt: ago(400 * DAY), usedAt: ago(399 * DAY) });

      expect(await deleteExpiredRows(trx, NOW)).toEqual({ sessions: 0, links: 0, sends: 0 });
      expect(await linkExists(trx, expired)).toBe(true);
      expect(await linkExists(trx, used)).toBe(true);

      await confirmSeededEvent(trx, id);

      expect(await deleteExpiredRows(trx, NOW)).toEqual({ sessions: 0, links: 2, sends: 0 });
      expect(await linkExists(trx, expired)).toBe(false);
      expect(await linkExists(trx, used)).toBe(false);
    });
  });

  it("of confirmation stays for one pending event and goes for a confirmed one, side by side", async () => {
    await withRollback(async (trx) => {
      const pending = (await seedEvent(trx)).id;
      const confirmed = (await seedEvent(trx)).id;
      await confirmSeededEvent(trx, confirmed);
      const kept = await seedLink(trx, { kind: "confirmation", eventId: pending }, { createdAt: ago(37 * DAY) });
      const gone = await seedLink(trx, { kind: "confirmation", eventId: confirmed }, { createdAt: ago(37 * DAY) });

      expect(await deleteExpiredRows(trx, NOW)).toEqual({ sessions: 0, links: 1, sends: 0 });
      expect(await linkExists(trx, kept)).toBe(true);
      expect(await linkExists(trx, gone)).toBe(false);
    });
  });

  // #802: confirmed, its account deleted, the event keeps `confirmed_at` without `account_id`.
  it("of confirmation goes for an event confirmed whose account is deleted: confirmed_at decides, not account_id", async () => {
    await withRollback(async (trx) => {
      const { id } = await seedEvent(trx);
      const accountId = await confirmSeededEvent(trx, id);
      await trx.deleteFrom("account").where("id", "=", accountId).execute();
      const event = await trx.selectFrom("event").select(["account_id", "confirmed_at"]).where("id", "=", id).executeTakeFirstOrThrow();
      expect(event.account_id).toBeNull();
      expect(event.confirmed_at).not.toBeNull();
      const gone = await seedLink(trx, { kind: "confirmation", eventId: id }, { createdAt: ago(37 * DAY) });

      expect(await deleteExpiredRows(trx, NOW)).toEqual({ sessions: 0, links: 1, sends: 0 });
      expect(await linkExists(trx, gone)).toBe(false);
    });
  });
});

describe("a run", () => {
  it("leaves the accounts, the events and a pending event's link, and a second run deletes nothing", async () => {
    await withRollback(async (trx) => {
      const accountId = await seedAccount(trx, { last_visit_at: ago(400 * DAY) });
      const { id } = await seedEvent(trx);
      await seedSession(trx, accountId, { createdAt: ago(400 * DAY), lastVisitAt: ago(400 * DAY) });
      await seedLink(trx, { kind: "login", accountId, returnEventId: id }, { createdAt: ago(400 * DAY) });
      const pendingLink = await seedLink(trx, { kind: "confirmation", eventId: id }, { createdAt: ago(400 * DAY) });
      await seedSends(trx, 3, { kind: "confirmation", email: anAddress(), eventId: id, sentAt: ago(400 * DAY) });

      expect(await deleteExpiredRows(trx, NOW)).toEqual({ sessions: 1, links: 1, sends: 3 });
      expect(await deleteExpiredRows(trx, NOW)).toEqual({ sessions: 0, links: 0, sends: 0 });

      expect(await linkExists(trx, pendingLink)).toBe(true);
      expect(await trx.selectFrom("account").select("id").where("id", "=", accountId).executeTakeFirst()).toBeDefined();
      expect(await trx.selectFrom("event").select("id").where("id", "=", id).executeTakeFirst()).toBeDefined();
    });
  });
});
