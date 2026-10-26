import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { SESSION_LIFETIME_MS } from "@/domain/account-rules";
import { hashToken } from "@/domain/token-hash";
import type { Database } from "./schema";
import { closeSession, findSession, openSession, visitSession } from "./sessions";
import { anAddress, seedAccount, seedSession } from "./test-accounts";
import { withRollback } from "./test-db";

const DAY = 24 * 60 * 60_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY);

const accountRow = (db: Kysely<Database>, id: string) =>
  db.selectFrom("account").select(["locale", "last_visit_at"]).where("id", "=", id).executeTakeFirstOrThrow();

describe("openSession", () => {
  // OA9.1: another browser of the same account keeps its own session.
  it("gives a new 128-bit token, keeps only its SHA-256, and leaves the account's other sessions open", async () => {
    await withRollback(async (trx) => {
      const accountId = await seedAccount(trx);
      const token = await openSession(trx, accountId);
      expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
      const rows = await trx.selectFrom("session").selectAll().where("account_id", "=", accountId).execute();
      expect(rows.map((row) => row.token_hash.toString("hex"))).toEqual([hashToken(token)]);
      expect(JSON.stringify(rows)).not.toContain(token);
      const second = await openSession(trx, accountId);
      expect(await findSession(trx, token)).toMatchObject({ id: accountId });
      expect(await findSession(trx, second)).toMatchObject({ id: accountId });
    });
  });
});

describe("findSession", () => {
  // OA9.6: 90 days after the last visit, not after the opening.
  it("gives the account of a live session, nothing 90 days after the last visit, whenever it was opened", async () => {
    await withRollback(async (trx) => {
      const email = anAddress();
      const accountId = await seedAccount(trx, { email });
      const ended = await seedSession(trx, accountId, { lastVisitAt: daysAgo(91) });
      const kept = await seedSession(trx, accountId, { createdAt: daysAgo(400), lastVisitAt: daysAgo(89) });
      expect(await findSession(trx, ended)).toBeUndefined();
      expect(await findSession(trx, kept)).toMatchObject({ id: accountId, email });
    });
  });

  it("ends exactly at the last visit plus the lifetime", async () => {
    await withRollback(async (trx) => {
      const accountId = await seedAccount(trx);
      const lastVisitAt = new Date("2026-03-01T10:00:00.000Z");
      const token = await seedSession(trx, accountId, { lastVisitAt });
      const end = lastVisitAt.getTime() + SESSION_LIFETIME_MS;
      expect(await findSession(trx, token, new Date(end - 1))).toMatchObject({ id: accountId });
      expect(await findSession(trx, token, new Date(end))).toBeUndefined();
    });
  });

  it("gives nothing for an unknown token, a truncated one, its hash, or a value that is not a string", async () => {
    await withRollback(async (trx) => {
      const token = await seedSession(trx, await seedAccount(trx));
      for (const presented of [token.slice(0, -1), "AAAAAAAAAAAAAAAAAAAAAA", hashToken(token), undefined, 42, { token }]) {
        expect(await findSession(trx, presented)).toBeUndefined();
      }
    });
  });
});

describe("visitSession", () => {
  // OA9.6 and OA9.7: every page load slides the session, and notes the visit and its language on the account.
  it("slides the session and writes the visit and its language on the account", async () => {
    await withRollback(async (trx) => {
      const accountId = await seedAccount(trx, { locale: "fr", last_visit_at: daysAgo(30) });
      const token = await seedSession(trx, accountId, { createdAt: daysAgo(80), lastVisitAt: daysAgo(80) });
      const before = Date.now();
      expect(await visitSession(trx, token, "en")).toMatchObject({ id: accountId, locale: "en" });
      const session = await trx
        .selectFrom("session")
        .select(["created_at", "last_visit_at"])
        .where("account_id", "=", accountId)
        .executeTakeFirstOrThrow();
      const account = await accountRow(trx, accountId);
      expect(session.last_visit_at.getTime()).toBeGreaterThan(before - 60_000);
      expect(session.created_at.getTime()).toBeLessThan(daysAgo(79).getTime());
      expect(account).toEqual({ locale: "en", last_visit_at: session.last_visit_at });
      expect(await findSession(trx, token, new Date(Date.now() + 89 * DAY))).toMatchObject({ id: accountId });
    });
  });

  it("does not bring back an ended session, and writes nothing on the account", async () => {
    await withRollback(async (trx) => {
      const lastVisitAt = daysAgo(100);
      const accountId = await seedAccount(trx, { locale: "fr", last_visit_at: lastVisitAt });
      const token = await seedSession(trx, accountId, { lastVisitAt: daysAgo(91) });
      expect(await visitSession(trx, token, "en")).toBeUndefined();
      expect(await accountRow(trx, accountId)).toEqual({ locale: "fr", last_visit_at: lastVisitAt });
      expect(await findSession(trx, token)).toBeUndefined();
      expect(await visitSession(trx, "AAAAAAAAAAAAAAAAAAAAAA", "fr")).toBeUndefined();
      expect(await visitSession(trx, null, "fr")).toBeUndefined();
    });
  });
});

describe("closeSession", () => {
  // OA9.1: « Se déconnecter » ends this session; another browser of the same account keeps its own.
  it("ends this session only", async () => {
    await withRollback(async (trx) => {
      const accountId = await seedAccount(trx);
      const closed = await seedSession(trx, accountId);
      const other = await seedSession(trx, accountId);
      expect(await closeSession(trx, closed)).toBe(true);
      expect(await findSession(trx, closed)).toBeUndefined();
      expect(await findSession(trx, other)).toMatchObject({ id: accountId });
      expect(await closeSession(trx, closed)).toBe(false);
      expect(await closeSession(trx, 7)).toBe(false);
    });
  });
});
