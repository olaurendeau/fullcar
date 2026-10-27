import { sql, type Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import {
  CONFIRMATIONS_PER_ADDRESS,
  CONFIRMATIONS_PER_EVENT,
  GLOBAL_SENDS_PER_HOUR,
  LOGINS_PER_ADDRESS,
  SEND_WINDOW_MS,
} from "@/domain/send-limits";
import { SEND_LOCK_CLASS, lockAddress, lockGlobalSends, recordSend } from "./email-sends";
import type { Database } from "./schema";
import { anAddress, seedSends, withCommittedAddresses } from "./test-accounts";
import { whileHeld, withCommittedEvent } from "./test-committed";
import { withRollback } from "./test-db";
import { seedEvent } from "./test-events";

const MINUTE = 60_000;
const ago = (ms: number) => new Date(Date.now() - ms);

const sendsTo = (db: Kysely<Database>, email: string) =>
  db.selectFrom("email_send").select(["kind", "email", "event_id"]).where("email", "=", email).execute();

/** Every send of the window, as the global cap counts it. */
async function sendsInWindow(db: Kysely<Database>) {
  const { rows } = await sql<{ count: number }>`
    select count(*)::int as count from email_send where sent_at > ${ago(SEND_WINDOW_MS)}`.execute(db);
  return rows[0]!.count;
}

/** Sends to as many addresses as needed for the window to hold `count` sends, all kinds together. */
async function fillWindowTo(db: Kysely<Database>, count: number, address: () => string = anAddress) {
  const missing = count - (await sendsInWindow(db));
  if (missing < 0) throw new Error("fillWindowTo: the window already holds more sends");
  await seedSends(db, missing, { kind: "login", email: address });
}

describe("recordSend", () => {
  it("records a confirmation email with its event, and the answer to a sign-in request without one", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const email = anAddress();
      expect(await recordSend(trx, { kind: "confirmation", eventId, email })).toBe("recorded");
      expect(await recordSend(trx, { kind: "login", email })).toBe("recorded");
      expect(await sendsTo(trx, email)).toEqual([
        { kind: "confirmation", email, event_id: eventId },
        { kind: "login", email, event_id: null },
      ]);
    });
  });

  // OA2.4: 3 confirmation emails per hour for an event, creation, resends and corrections included.
  it("lets the 3rd confirmation of an event go, then stops the next one, and records nothing for an event gone", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      await seedSends(trx, CONFIRMATIONS_PER_EVENT - 1, { kind: "confirmation", eventId, email: () => anAddress() });
      expect(await recordSend(trx, { kind: "confirmation", eventId, email: anAddress() })).toBe("recorded");
      const corrected = anAddress();
      expect(await recordSend(trx, { kind: "confirmation", eventId, email: corrected })).toBe("event");
      expect(await recordSend(trx, { kind: "confirmation", eventId: "zzzzzzzz", email: corrected })).toBe("eventGone");
      expect(await sendsTo(trx, corrected)).toEqual([]);
    });
  });

  it("no longer counts a send of an hour ago", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const email = anAddress();
      await seedSends(trx, CONFIRMATIONS_PER_EVENT, { kind: "confirmation", eventId, email, sentAt: ago(61 * MINUTE) });
      expect(await recordSend(trx, { kind: "confirmation", eventId, email })).toBe("recorded");
    });
  });

  // OA1.9: 5 confirmation emails per hour to one address, all events together, a deleted one included.
  it("stops the 6th confirmation to an address, whatever the event", async () => {
    await withRollback(async (trx) => {
      const email = anAddress();
      await seedSends(trx, CONFIRMATIONS_PER_ADDRESS - 1, { kind: "confirmation", eventId: null, email });
      const { id: fifth } = await seedEvent(trx);
      const { id: sixth } = await seedEvent(trx);
      expect(await recordSend(trx, { kind: "confirmation", eventId: fifth, email })).toBe("recorded");
      expect(await recordSend(trx, { kind: "confirmation", eventId: sixth, email })).toBe("address");
      expect(await sendsTo(trx, email)).toHaveLength(CONFIRMATIONS_PER_ADDRESS);
    });
  });

  // OA4.5: the 6th sign-in request in an hour for an address, with or without an account (OA3.5).
  it("stops the 6th sign-in request to an address, counted apart from its confirmation emails", async () => {
    await withRollback(async (trx) => {
      const email = anAddress();
      const { id: eventId } = await seedEvent(trx);
      await seedSends(trx, CONFIRMATIONS_PER_ADDRESS, { kind: "confirmation", email });
      await seedSends(trx, LOGINS_PER_ADDRESS - 1, { kind: "login", email });
      expect(await recordSend(trx, { kind: "login", email })).toBe("recorded");
      expect(await recordSend(trx, { kind: "login", email })).toBe("address");
      expect(await sendsTo(trx, email)).toHaveLength(CONFIRMATIONS_PER_ADDRESS + LOGINS_PER_ADDRESS);
      const other = anAddress();
      await seedSends(trx, LOGINS_PER_ADDRESS, { kind: "login", email: other });
      expect(await recordSend(trx, { kind: "confirmation", eventId, email: other })).toBe("recorded");
    });
  });

  // Coordinator decision 2 on #581: every email of the hour, whatever its kind and its address.
  it("lets the 50th email of the hour go, then stops every kind, whatever the address", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      await fillWindowTo(trx, GLOBAL_SENDS_PER_HOUR - 1);
      expect(await recordSend(trx, { kind: "confirmation", eventId, email: anAddress() })).toBe("recorded");
      expect(await recordSend(trx, { kind: "login", email: anAddress() })).toBe("global");
      expect(await recordSend(trx, { kind: "confirmation", eventId, email: anAddress() })).toBe("global");
      expect(await sendsInWindow(trx)).toBe(GLOBAL_SENDS_PER_HOUR);
    });
  });

  // docs/agents/architecture.md, « L'adresse après l'Event »: counting and recording are one step.
  describe("two sends at once, on committed data", () => {
    it("lets one more confirmation of an event go, not two, even to two addresses", async () => {
      await withCommittedEvent(async (db, eventId) => {
        await withCommittedAddresses(async (_, address) => {
          await seedSends(db, CONFIRMATIONS_PER_EVENT - 1, { kind: "confirmation", eventId, email: address });
          const second = await whileHeld(
            db,
            async (trx) => expect(await recordSend(trx, { kind: "confirmation", eventId, email: address() })).toBe("recorded"),
            () => recordSend(db, { kind: "confirmation", eventId, email: address() }),
          );
          expect(second).toBe("event");
          const sent = await db.selectFrom("email_send").select("id").where("event_id", "=", eventId).execute();
          expect(sent).toHaveLength(CONFIRMATIONS_PER_EVENT);
        });
      });
    });

    it("lets one more confirmation to an address go, not two, from two events", async () => {
      await withCommittedEvent(async (db, first) => {
        await withCommittedEvent(async (_, second) => {
          await withCommittedAddresses(async (__, address) => {
            const email = address();
            await seedSends(db, CONFIRMATIONS_PER_ADDRESS - 1, { kind: "confirmation", email });
            const outcome = await whileHeld(
              db,
              async (trx) => expect(await recordSend(trx, { kind: "confirmation", eventId: first, email })).toBe("recorded"),
              () => recordSend(db, { kind: "confirmation", eventId: second, email }),
            );
            expect(outcome).toBe("address");
            expect(await sendsTo(db, email)).toHaveLength(CONFIRMATIONS_PER_ADDRESS);
          });
        });
      });
    });

    it("lets the 50th email of the hour go, not a 51st, to two other addresses", async () => {
      await withCommittedAddresses(async (db, address) => {
        await fillWindowTo(db, GLOBAL_SENDS_PER_HOUR - 1, address);
        const outcome = await whileHeld(
          db,
          async (trx) => expect(await recordSend(trx, { kind: "login", email: address() })).toBe("recorded"),
          () => recordSend(db, { kind: "login", email: address() }),
        );
        expect(outcome).toBe("global");
        expect(await sendsInWindow(db)).toBe(GLOBAL_SENDS_PER_HOUR);
      }, { fillsTheWindow: true });
    });
  });

  describe("the lock order: Event, then address, then the global cap", () => {
    it("holds the Event while it waits for the address", async () => {
      await withCommittedEvent(async (db, eventId) => {
        await withCommittedAddresses(async (_, address) => {
          const email = address();
          const outcome = await whileHeld(
            db,
            (trx) => lockAddress(trx, email),
            () => recordSend(db, { kind: "confirmation", eventId, email }),
            async () => {
              const takeEvent = db.selectFrom("event").select("id").where("id", "=", eventId).forNoKeyUpdate().noWait();
              await expect(takeEvent.execute()).rejects.toMatchObject({ code: "55P03" });
            },
          );
          expect(outcome).toBe("recorded");
        });
      });
    });

    it("holds the address while it waits for the global cap", async () => {
      await withCommittedEvent(async (db, eventId) => {
        await withCommittedAddresses(async (_, address) => {
          const outcome = await whileHeld(
            db,
            (trx) => lockGlobalSends(trx),
            () => recordSend(db, { kind: "confirmation", eventId, email: address() }),
            async (waiting) => {
              const { rows } = await sql<{ classid: number; granted: boolean }>`
                select classid::int, granted from pg_locks
                where pid = ${waiting} and locktype = 'advisory' order by classid`.execute(db);
              expect(rows).toEqual([
                { classid: SEND_LOCK_CLASS.address, granted: true },
                { classid: SEND_LOCK_CLASS.global, granted: false },
              ]);
            },
          );
          expect(outcome).toBe("recorded");
        });
      });
    });
  });
});
