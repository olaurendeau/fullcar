import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { CONFIRMATION_LINK_LIFETIME_MS, LOGIN_LINK_LIFETIME_MS, TRANSFER_LINK_LIFETIME_MS } from "@/domain/account-rules";
import { CONFIRMATIONS_PER_ADDRESS, CONFIRMATIONS_PER_EVENT, TRANSFERS_PER_EVENT } from "@/domain/send-limits";
import { hashToken } from "@/domain/token-hash";
import { anonymiseEvent, deleteEvent } from "./day-thirty";
import { claimConfirmation, claimTransfer, createLink, deleteTransferLinks, findLink, useLink } from "./email-links";
import { lockEvent } from "./events";
import type { Database } from "./schema";
import { anAddress, seedAccount, seedLink, seedSends, withCommittedAddresses, withRollbackRecordingSends } from "./test-accounts";
import { whileHeld, withCommittedEvent } from "./test-committed";
import { withRollback } from "./test-db";
import { tokenKey } from "./token-key";
import { atomically } from "./transaction";
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

const linksOf = (db: Kysely<Database>, eventId: string) =>
  db.selectFrom("email_link").select("token_hash").where("event_id", "=", eventId).execute();

const sendsTo = (db: Kysely<Database>, email: string) =>
  db.selectFrom("email_send").select(["kind", "event_id"]).where("email", "=", email).execute();

describe("claimConfirmation", () => {
  it("records the send and gives the token of a new confirmation link of the event", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const email = anAddress();
      const claimed = await claimConfirmation(trx, eventId, email);
      if (claimed.claim !== "recorded") throw new Error(`expected a link, got ${claimed.claim}`);
      expect(await findLink(trx, claimed.token)).toMatchObject({ kind: "confirmation", eventId, usedAt: null });
      expect(await linksOf(trx, eventId)).toHaveLength(1);
      expect(await sendsTo(trx, email)).toEqual([{ kind: "confirmation", event_id: eventId }]);
    });
  });

  // #599, review of #795: a link only after an accepted send, so the links of a pending event stay bounded.
  it.each([
    ["the address", "address", (trx: Kysely<Database>, email: string) => seedSends(trx, CONFIRMATIONS_PER_ADDRESS, { kind: "confirmation", email })],
    ["the event", "event", (trx: Kysely<Database>, _: string, eventId: string) =>
      seedSends(trx, CONFIRMATIONS_PER_EVENT, { kind: "confirmation", eventId, email: () => anAddress() })],
  ] as const)("creates no link when the limit of %s stops the send", async (_, limit, fill) => {
    await withRollbackRecordingSends(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const email = anAddress();
      await fill(trx, email, eventId);
      const sendsBefore = (await sendsTo(trx, email)).length;
      expect(await claimConfirmation(trx, eventId, email)).toEqual({ claim: limit });
      expect(await linksOf(trx, eventId)).toEqual([]);
      expect(await sendsTo(trx, email)).toHaveLength(sendsBefore);
    });
  });

  it("records nothing for an unknown event", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const email = anAddress();
      expect(await claimConfirmation(trx, "zzzzzzzz", email)).toEqual({ claim: "eventGone" });
      expect(await sendsTo(trx, email)).toEqual([]);
    });
  });

  // Review of #782: under the purge's lock, the claim waits, and then neither sends nor links.
  describe("while the purge holds the event, on committed data", () => {
    it("waits for its deletion, then records no send", async () => {
      await withCommittedEvent(async (db, eventId) => {
        await withCommittedAddresses(async (_, address) => {
          const email = address();
          const claimed = await whileHeld(
            db,
            async (trx) => {
              await lockEvent(trx, eventId, "noKeyUpdate");
              await deleteEvent(trx, eventId);
            },
            (own) => claimConfirmation(own, eventId, email),
          );
          expect(claimed).toEqual({ claim: "eventGone" });
          expect(await sendsTo(db, email)).toEqual([]);
        });
      });
    });

    it("waits for its anonymisation, then neither sends nor leaves a link behind it", async () => {
      await withCommittedEvent(async (db, eventId) => {
        await withCommittedAddresses(async (_, address) => {
          const accountId = await seedAccount(db, { email: address() });
          await db.updateTable("event").set({ account_id: accountId, confirmed_at: new Date() }).where("id", "=", eventId).execute();
          const email = address();
          const claimed = await whileHeld(
            db,
            async (trx) => {
              await lockEvent(trx, eventId, "noKeyUpdate");
              await anonymiseEvent(trx, eventId);
            },
            (own) => claimConfirmation(own, eventId, email),
          );
          expect(claimed).toEqual({ claim: "eventEnded" });
          expect(await linksOf(db, eventId)).toEqual([]);
          expect(await sendsTo(db, email)).toEqual([]);
        });
      });
    });
  });
});

describe("claimTransfer", () => {
  it("records the send and gives the token of a new transfer link of the event", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const email = anAddress();
      const claimed = await claimTransfer(trx, eventId, email);
      if (claimed.claim !== "recorded") throw new Error(`expected a link, got ${claimed.claim}`);
      expect(await findLink(trx, claimed.token)).toMatchObject({ kind: "transfer", eventId, accountId: null, usedAt: null });
      expect(await linksOf(trx, eventId)).toHaveLength(1);
      expect(await sendsTo(trx, email)).toEqual([{ kind: "transfer", event_id: eventId }]);
    });
  });

  it("makes one more link at each claim, the earlier ones kept (OT2.3)", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const email = anAddress();
      await claimTransfer(trx, eventId, email);
      await claimTransfer(trx, eventId, email);
      expect(await linksOf(trx, eventId)).toHaveLength(2);
    });
  });

  // OT6.5: the 4th email of an hour for an event, the 6th to an address, confirmations and transfers together.
  it.each([
    [
      "the address, confirmations and transfers together",
      "address",
      async (trx: Kysely<Database>, email: string) => {
        await seedSends(trx, CONFIRMATIONS_PER_ADDRESS - 2, { kind: "confirmation", email });
        await seedSends(trx, 2, { kind: "transfer", email });
      },
    ],
    [
      "the event",
      "event",
      async (trx: Kysely<Database>, _: string, eventId: string) =>
        seedSends(trx, TRANSFERS_PER_EVENT, { kind: "transfer", eventId, email: () => anAddress() }),
    ],
  ] as const)("creates no link when the limit of %s stops the send", async (_, limit, fill) => {
    await withRollbackRecordingSends(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const email = anAddress();
      await fill(trx, email, eventId);
      const sendsBefore = (await sendsTo(trx, email)).length;
      expect(await claimTransfer(trx, eventId, email)).toEqual({ claim: limit });
      expect(await linksOf(trx, eventId)).toEqual([]);
      expect(await sendsTo(trx, email)).toHaveLength(sendsBefore);
    });
  });

  it("records nothing for an unknown event", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const email = anAddress();
      expect(await claimTransfer(trx, "zzzzzzzz", email)).toEqual({ claim: "eventGone" });
      expect(await sendsTo(trx, email)).toEqual([]);
    });
  });

  describe("while the purge holds the event, on committed data", () => {
    it("waits for its deletion, then records no send", async () => {
      await withCommittedEvent(async (db, eventId) => {
        await withCommittedAddresses(async (_, address) => {
          const email = address();
          const claimed = await whileHeld(
            db,
            async (trx) => {
              await lockEvent(trx, eventId, "noKeyUpdate");
              await deleteEvent(trx, eventId);
            },
            (own) => claimTransfer(own, eventId, email),
          );
          expect(claimed).toEqual({ claim: "eventGone" });
          expect(await sendsTo(db, email)).toEqual([]);
        });
      });
    });

    it("waits for its anonymisation, then neither sends nor leaves a link behind it", async () => {
      await withCommittedEvent(async (db, eventId) => {
        await withCommittedAddresses(async (_, address) => {
          const accountId = await seedAccount(db, { email: address() });
          await db.updateTable("event").set({ account_id: accountId, confirmed_at: new Date() }).where("id", "=", eventId).execute();
          const email = address();
          const claimed = await whileHeld(
            db,
            async (trx) => {
              await lockEvent(trx, eventId, "noKeyUpdate");
              await anonymiseEvent(trx, eventId);
            },
            (own) => claimTransfer(own, eventId, email),
          );
          expect(claimed).toEqual({ claim: "eventEnded" });
          expect(await linksOf(db, eventId)).toEqual([]);
          expect(await sendsTo(db, email)).toEqual([]);
        });
      });
    });
  });
});

describe("deleteTransferLinks", () => {
  it("deletes every transfer link of the event, used or not, and says how many (OT2.5)", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      for (let n = 0; n < 3; n++) await seedLink(trx, { kind: "transfer", eventId });
      await seedLink(trx, { kind: "transfer", eventId }, { usedAt: new Date() });
      expect(await deleteTransferLinks(trx, eventId)).toBe(4);
      expect(await linksOf(trx, eventId)).toEqual([]);
    });
  });

  it("keeps the link of `except`, the others of the event gone (OT2.4)", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      await seedLink(trx, { kind: "transfer", eventId });
      const kept = await seedLink(trx, { kind: "transfer", eventId });
      await seedLink(trx, { kind: "transfer", eventId });
      expect(await deleteTransferLinks(trx, eventId, { except: kept })).toBe(2);
      expect((await linksOf(trx, eventId)).map((row) => row.token_hash)).toEqual([tokenKey(kept)]);
    });
  });

  it("deletes the links of this event and of its kind only", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const { id: other } = await seedEvent(trx);
      const accountId = await seedAccount(trx);
      const elsewhere = await seedLink(trx, { kind: "transfer", eventId: other });
      const confirmation = await seedLink(trx, { kind: "confirmation", eventId });
      const login = await seedLink(trx, { kind: "login", accountId, returnEventId: eventId });
      await seedLink(trx, { kind: "transfer", eventId });
      expect(await deleteTransferLinks(trx, eventId)).toBe(1);
      expect(await findLink(trx, elsewhere)).not.toBeNull();
      expect(await findLink(trx, confirmation)).not.toBeNull();
      expect(await findLink(trx, login)).not.toBeNull();
    });
  });

  it("refuses an `except` that is not a token, rather than delete them all", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      await seedLink(trx, { kind: "transfer", eventId });
      await expect(deleteTransferLinks(trx, eventId, { except: 42 as unknown as string })).rejects.toThrow();
      expect(await linksOf(trx, eventId)).toHaveLength(1);
    });
  });

  // Locked by key before they go, as the purge does: a link deleted meanwhile is not an error.
  it("waits for a link another transaction holds, and counts only the links it deleted itself", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const held = await seedLink(db, { kind: "transfer", eventId });
      await seedLink(db, { kind: "transfer", eventId });
      const deleted = await whileHeld(
        db,
        async (trx) => {
          await trx.deleteFrom("email_link").where("token_hash", "=", tokenKey(held)!).execute();
        },
        (own) => atomically(own, (trx) => deleteTransferLinks(trx, eventId)),
      );
      expect(deleted).toBe(1);
      expect(await linksOf(db, eventId)).toEqual([]);
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

  it("uses a valid transfer link once, and gives its event", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const token = await seedLink(trx, { kind: "transfer", eventId });
      const used = await useLink(trx, token, "transfer");
      expect(used).toMatchObject({ outcome: "valid", link: { kind: "transfer", eventId, accountId: null } });
      expect(await useLink(trx, token, "transfer")).toEqual({ outcome: "used" });
    });
  });

  // OT2.6: seeded in the past, not by moving the clock. At 6 days 23 hours it serves, at 7 days 1 hour it does not.
  it("uses a transfer link at 6 days 23 hours, not at 7 days 1 hour", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const fresh = await seedLink(trx, { kind: "transfer", eventId }, { createdAt: ago(TRANSFER_LINK_LIFETIME_MS - 60 * MINUTE) });
      const stale = await seedLink(trx, { kind: "transfer", eventId }, { createdAt: ago(TRANSFER_LINK_LIFETIME_MS + 60 * MINUTE) });
      expect(await useLink(trx, fresh, "transfer")).toMatchObject({ outcome: "valid" });
      expect(await useLink(trx, stale, "transfer")).toEqual({ outcome: "expired" });
      expect((await findLink(trx, stale))?.usedAt).toBeNull();
    });
  });

  it("does not use a transfer link on another page, nor another link on the transfer page", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const transfer = await seedLink(trx, { kind: "transfer", eventId });
      const confirmation = await seedLink(trx, { kind: "confirmation", eventId });
      const login = await aLoginLink(trx);
      expect(await useLink(trx, transfer, "confirmation")).toEqual({ outcome: "invalid" });
      expect(await useLink(trx, transfer, "login")).toEqual({ outcome: "invalid" });
      expect(await useLink(trx, confirmation, "transfer")).toEqual({ outcome: "invalid" });
      expect(await useLink(trx, login, "transfer")).toEqual({ outcome: "invalid" });
      expect((await findLink(trx, transfer))?.usedAt).toBeNull();
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
        (own) => useLink(own, token, "login"),
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
        (own) => useLink(own, token, "confirmation"),
      );
      expect(second).toEqual({ outcome: "used" });
    });
  });

  it("serves a transfer link once, even to two requests at once", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const token = await seedLink(db, { kind: "transfer", eventId });
      const second = await whileHeld(
        db,
        async (trx) => expect(await useLink(trx, token, "transfer")).toMatchObject({ outcome: "valid" }),
        (own) => useLink(own, token, "transfer"),
      );
      expect(second).toEqual({ outcome: "used" });
    });
  });
});
