import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { CONFIRMATION_LINK_LIFETIME_MS, LOGIN_LINK_LIFETIME_MS } from "@/domain/account-rules";
import { hashToken } from "@/domain/token-hash";
import { createLink, findLink, useLink } from "./email-links";
import type { Database } from "./schema";
import { seedAccount, seedLink, withCommittedAddresses } from "./test-accounts";
import { whileHeld, withCommittedEvent } from "./test-committed";
import { withRollback } from "./test-db";
import { seedEvent } from "./test-events";

const MINUTE = 60_000;
const ago = (ms: number) => new Date(Date.now() - ms);

const aLoginLink = async (db: Kysely<Database>, email?: string) =>
  seedLink(db, { kind: "login", accountId: await seedAccount(db, email === undefined ? {} : { email }), returnEventId: null });

describe("createLink", () => {
  // OA4.4: a sign-in link keeps the page it was asked from; a confirmation link, its event.
  it("gives a new 128-bit token, keeps only its SHA-256, and what the link opens", async () => {
    await withRollback(async (trx) => {
      const accountId = await seedAccount(trx);
      const { id: eventId } = await seedEvent(trx);
      const login = await createLink(trx, { kind: "login", accountId, returnEventId: eventId });
      const confirmation = await createLink(trx, { kind: "confirmation", eventId });
      expect(login).toMatch(/^[A-Za-z0-9_-]{22}$/);
      const rows = await trx.selectFrom("email_link").selectAll().where("account_id", "=", accountId).execute();
      expect(rows.map((row) => row.token_hash.toString("hex"))).toEqual([hashToken(login)]);
      expect(JSON.stringify(rows)).not.toContain(login);
      expect(await findLink(trx, login)).toMatchObject({ kind: "login", accountId, eventId: null, returnEventId: eventId });
      expect(await findLink(trx, confirmation)).toMatchObject({ kind: "confirmation", accountId: null, eventId });
    });
  });
});

describe("findLink", () => {
  // OA5.7: absent, truncated by one character, or unknown.
  it("gives nothing for an unknown token, a truncated one, its hash, or a value that is not a string", async () => {
    await withRollback(async (trx) => {
      const token = await aLoginLink(trx);
      for (const presented of [token.slice(0, -1), "AAAAAAAAAAAAAAAAAAAAAA", hashToken(token), "", undefined, ["x"]]) {
        expect(await findLink(trx, presented)).toBeNull();
      }
    });
  });
});

describe("useLink", () => {
  it("uses a valid sign-in link once, and gives its account and where it lands", async () => {
    await withRollback(async (trx) => {
      const accountId = await seedAccount(trx);
      const { id: eventId } = await seedEvent(trx);
      const token = await seedLink(trx, { kind: "login", accountId, returnEventId: eventId });
      const used = await useLink(trx, token, "login");
      expect(used).toMatchObject({ outcome: "valid", link: { kind: "login", accountId, returnEventId: eventId } });
      expect((await findLink(trx, token))?.usedAt).toBeInstanceOf(Date);
      // OA5.4: a second time, the link has already been used.
      expect(await useLink(trx, token, "login")).toEqual({ outcome: "used" });
    });
  });

  it("uses a valid confirmation link once, and gives its event", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const token = await seedLink(trx, { kind: "confirmation", eventId });
      const used = await useLink(trx, token, "confirmation");
      expect(used).toMatchObject({ outcome: "valid", link: { kind: "confirmation", eventId } });
      expect(await useLink(trx, token, "confirmation")).toEqual({ outcome: "used" });
    });
  });

  // OA5.5 and OA5.6: seeded in the past, not by moving the clock.
  it("does not use an expired link: 61 minutes for a sign-in link, 7 days and 1 minute for a confirmation link", async () => {
    await withRollback(async (trx) => {
      const accountId = await seedAccount(trx);
      const { id: eventId } = await seedEvent(trx);
      const login = await seedLink(trx, { kind: "login", accountId, returnEventId: null }, { createdAt: ago(61 * MINUTE) });
      const confirmationAge = { createdAt: ago(CONFIRMATION_LINK_LIFETIME_MS + MINUTE) };
      const confirmation = await seedLink(trx, { kind: "confirmation", eventId }, confirmationAge);
      expect(await useLink(trx, login, "login")).toEqual({ outcome: "expired" });
      expect(await useLink(trx, confirmation, "confirmation")).toEqual({ outcome: "expired" });
      expect((await findLink(trx, login))?.usedAt).toBeNull();
      expect((await findLink(trx, confirmation))?.usedAt).toBeNull();
    });
  });

  it("uses a link until the last instant of its lifetime", async () => {
    await withRollback(async (trx) => {
      const createdAt = new Date("2026-03-01T10:00:00.000Z");
      const accountId = await seedAccount(trx);
      const token = await seedLink(trx, { kind: "login", accountId, returnEventId: null }, { createdAt });
      const end = createdAt.getTime() + LOGIN_LINK_LIFETIME_MS;
      expect(await useLink(trx, token, "login", new Date(end))).toEqual({ outcome: "expired" });
      expect(await useLink(trx, token, "login", new Date(end - 1))).toMatchObject({ outcome: "valid" });
    });
  });

  it("does not use a link on the page for the other kind: a sign-in link confirms nothing", async () => {
    await withRollback(async (trx) => {
      const login = await aLoginLink(trx);
      const confirmation = await seedLink(trx, { kind: "confirmation", eventId: (await seedEvent(trx)).id });
      expect(await useLink(trx, login, "confirmation")).toEqual({ outcome: "invalid" });
      expect(await useLink(trx, confirmation, "login")).toEqual({ outcome: "invalid" });
      expect((await findLink(trx, login))?.usedAt).toBeNull();
      expect((await findLink(trx, confirmation))?.usedAt).toBeNull();
    });
  });

  it("says an unknown or malformed token is invalid", async () => {
    await withRollback(async (trx) => {
      expect(await useLink(trx, "AAAAAAAAAAAAAAAAAAAAAA", "login")).toEqual({ outcome: "invalid" });
      expect(await useLink(trx, undefined, "confirmation")).toEqual({ outcome: "invalid" });
    });
  });

  // Presented twice at once, on committed data: the second request waits for the first's row lock.
  it("serves a sign-in link once, even to two requests at once", async () => {
    await withCommittedAddresses(async (db, address) => {
      const token = await aLoginLink(db, address());
      const second = await whileHeld(
        db,
        async (trx) => expect(await useLink(trx, token, "login")).toMatchObject({ outcome: "valid" }),
        () => useLink(db, token, "login"),
      );
      expect(second).toEqual({ outcome: "used" });
    });
  });

  it("serves a confirmation link once, even to two requests at once", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const token = await seedLink(db, { kind: "confirmation", eventId });
      const second = await whileHeld(
        db,
        async (trx) => expect(await useLink(trx, token, "confirmation")).toMatchObject({ outcome: "valid" }),
        () => useLink(db, token, "confirmation"),
      );
      expect(second).toEqual({ outcome: "used" });
    });
  });
});
