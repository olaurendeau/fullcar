import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { anonymiseEvent } from "@/db/day-thirty";
import { createLink, findLink, useLink as spendLink } from "@/db/email-links";
import { lockEvent } from "@/db/events";
import type { Database } from "@/db/schema";
import { anAddress, seedSends, withCommittedAddresses, withRollbackRecordingSends } from "@/db/test-accounts";
import { whileHeld, withCommittedEvent } from "@/db/test-committed";
import { confirmSeededEvent, seedEvent, seedPendingSend } from "@/db/test-events";
import { generatePublicId } from "@/domain/public-id";
import { CONFIRMATIONS_PER_ADDRESS, CONFIRMATIONS_PER_EVENT } from "@/domain/send-limits";
import type { Brevo, Email, SendAnswer } from "@/email/brevo";
import { correctAddress, resendConfirmation, type Resending } from "./pending-email";

/*
 * #602, epic #581, OA2.5: « Corriger l'adresse ». The events are seeded pending, their first
 * email sent an hour ago; the earlier links are made by `createLink`, as the first email's.
 */

const HOUR = 60 * 60_000;
const ORIGIN = "https://fullcar.test";

/** Every line written to the console, by any of its methods: no address, no token among them. */
let logs: unknown[][];
beforeEach(() => {
  logs = [];
  for (const level of ["log", "info", "warn", "error", "debug", "trace"] as const) {
    vi.spyOn(console, level).mockImplementation((...args) => void logs.push(args));
  }
});
afterEach(() => vi.restoreAllMocks());

function sending(db: Kysely<Database>, answer: () => Promise<SendAnswer> = async () => ({ state: "sent" })) {
  const sent: Email[] = [];
  const brevo: Brevo = { send: (email) => (sent.push(email), answer()) };
  const deps: Resending = { db, now: new Date(), locale: "fr", origin: ORIGIN, brevo };
  return { deps, sent };
}

/** The token of the confirmation link in the email, after `#`. */
function tokenIn(email: Email): string {
  const match = new RegExp(`${ORIGIN}/connexion/confirmer#([A-Za-z0-9_-]{22})(?![A-Za-z0-9_-])`).exec(email.text);
  if (!match) throw new Error("expected a confirmation link in the email");
  return match[1]!;
}

const eventRow = (db: Kysely<Database>, id: string) =>
  db.selectFrom("event").select(["pending_email", "send_status", "send_status_at"]).where("id", "=", id).executeTakeFirstOrThrow();
const linksOf = (db: Kysely<Database>, id: string) => db.selectFrom("email_link").select("kind").where("event_id", "=", id).execute();
const sendsFor = (db: Kysely<Database>, id: string) => db.selectFrom("email_send").select(["email"]).where("event_id", "=", id).execute();

/** A pending event of the browser holding `token`, with the link of its first email. */
async function pendingEvent(db: Kysely<Database>, email = anAddress()) {
  const seeded = await seedEvent(db);
  await seedPendingSend(db, seeded.id, { email, status: "sent", at: new Date(Date.now() - HOUR) });
  const firstLink = await createLink(db, { kind: "confirmation", eventId: seeded.id });
  return { ...seeded, email, firstLink, proof: { adminToken: seeded.token } };
}

describe("correctAddress (OA2.5)", () => {
  it("sends the link to the new address, keeps it with the event, and the notice says it", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await pendingEvent(trx);
      const fixed = anAddress();
      const { deps, sent } = sending(trx);
      expect(await correctAddress(id, proof, fixed, deps)).toEqual({ ok: true, pending: { email: fixed, send: "sent" } });
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ to: fixed });
      expect(await eventRow(trx, id)).toMatchObject({ pending_email: fixed, send_status: "sent" });
      expect(await sendsFor(trx, id)).toEqual([{ email: fixed }]);
    });
  });

  it("reads the address as the creation does: trimmed, lower case", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await pendingEvent(trx);
      const { deps, sent } = sending(trx);
      const fixed = anAddress();
      expect(await correctAddress(id, proof, `  ${fixed.toUpperCase()} `, deps)).toEqual({ ok: true, pending: { email: fixed, send: "sent" } });
      expect(sent[0]).toMatchObject({ to: fixed });
    });
  });

  it("OA2.5: the link sent to the old address answers « Ce lien n'est pas valide »; only the new one serves", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof, firstLink } = await pendingEvent(trx);
      const resent = sending(trx);
      await resendConfirmation(id, proof, resent.deps);
      const { deps, sent } = sending(trx);
      await correctAddress(id, proof, anAddress(), deps);
      for (const old of [firstLink, tokenIn(resent.sent[0]!)]) {
        expect(await findLink(trx, old)).toBeNull();
        expect(await spendLink(trx, old, "confirmation")).toEqual({ outcome: "invalid" });
      }
      expect(await linksOf(trx, id)).toEqual([{ kind: "confirmation" }]);
      expect(await spendLink(trx, tokenIn(sent[0]!), "confirmation")).toMatchObject({ outcome: "valid", link: { eventId: id } });
    });
  });

  it("leaves the confirmation links of other events alone", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await pendingEvent(trx);
      const other = await pendingEvent(trx);
      await correctAddress(id, proof, anAddress(), sending(trx).deps);
      expect(await findLink(trx, other.firstLink)).toMatchObject({ eventId: other.id, usedAt: null });
    });
  });

  it("keeps the new link when Brevo fails: the notice says it, the old links are gone all the same", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof, firstLink } = await pendingEvent(trx);
      const fixed = anAddress();
      const { deps } = sending(trx, async () => ({ state: "failed" }));
      expect(await correctAddress(id, proof, fixed, deps)).toEqual({ ok: true, pending: { email: fixed, send: "failed" } });
      expect(await eventRow(trx, id)).toMatchObject({ pending_email: fixed, send_status: "failed" });
      expect(await findLink(trx, firstLink)).toBeNull();
      expect(await linksOf(trx, id)).toHaveLength(1);
    });
  });

  it.each([
    ["not an address", "camille", "invalid"],
    ["blank", "  ", "required"],
    ["missing", undefined, "required"],
    ["not a string", 42, "invalid"],
    ["too long", `${"x".repeat(250)}@a.fr`, "tooLong"],
  ])("OA2.5: %s is refused under the field; nothing is sent, nothing changes", async (_, typed, reason) => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, email, proof, firstLink } = await pendingEvent(trx);
      const before = await eventRow(trx, id);
      const { deps, sent } = sending(trx);
      expect(await correctAddress(id, proof, typed, deps)).toEqual({ ok: false, error: "address", reason });
      expect(sent).toEqual([]);
      expect(await eventRow(trx, id)).toEqual(before);
      expect(before.pending_email).toBe(email);
      expect(await findLink(trx, firstLink)).toMatchObject({ usedAt: null });
      expect(await sendsFor(trx, id)).toEqual([]);
    });
  });

  it("OA2.5: past 3 emails in the hour for the event, `tooMany`: nothing is sent, the old link still serves", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, email, proof, firstLink } = await pendingEvent(trx);
      await seedSends(trx, CONFIRMATIONS_PER_EVENT, { kind: "confirmation", email, eventId: id, sentAt: new Date() });
      const before = await eventRow(trx, id);
      const { deps, sent } = sending(trx);
      expect(await correctAddress(id, proof, anAddress(), deps)).toEqual({ ok: false, error: "tooMany" });
      expect(sent).toEqual([]);
      expect(await eventRow(trx, id)).toEqual(before);
      expect(await findLink(trx, firstLink)).toMatchObject({ usedAt: null });
    });
  });

  it("OA2.5: a correction counts in the event's limit, the creation's email and the resends with it", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, email, proof } = await pendingEvent(trx);
      await seedSends(trx, 1, { kind: "confirmation", email, eventId: id, sentAt: new Date() });
      const { deps } = sending(trx);
      expect(await correctAddress(id, proof, anAddress(), deps)).toMatchObject({ ok: true });
      expect(await resendConfirmation(id, proof, deps)).toMatchObject({ ok: true });
      expect(await correctAddress(id, proof, anAddress(), deps)).toEqual({ ok: false, error: "tooMany" });
      expect(await sendsFor(trx, id)).toHaveLength(CONFIRMATIONS_PER_EVENT);
    });
  });

  it("OA2.5: stops at the limit of the new address (OA1.9), keeping the old link", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof, firstLink } = await pendingEvent(trx);
      const fixed = anAddress();
      await seedSends(trx, CONFIRMATIONS_PER_ADDRESS, { kind: "confirmation", email: fixed, sentAt: new Date() });
      const { deps, sent } = sending(trx);
      expect(await correctAddress(id, proof, fixed, deps)).toEqual({ ok: false, error: "tooMany" });
      expect(sent).toEqual([]);
      expect(await findLink(trx, firstLink)).toMatchObject({ usedAt: null });
    });
  });
});

describe("correctAddress, who may ask", () => {
  it.each<[string, unknown]>([
    ["no proof", undefined],
    ["another token", { adminToken: "AAAAAAAAAAAAAAAAAAAAAA" }],
    ["a token that is not a string", { adminToken: 42 }],
  ])("refuses %s, and changes nothing", async (_, proof) => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, firstLink } = await pendingEvent(trx);
      const before = await eventRow(trx, id);
      const { deps, sent } = sending(trx);
      expect(await correctAddress(id, proof, anAddress(), deps)).toEqual({ ok: false, error: "invalid" });
      expect(sent).toEqual([]);
      expect(await eventRow(trx, id)).toEqual(before);
      expect(await findLink(trx, firstLink)).toMatchObject({ usedAt: null });
    });
  });

  it("answers `notPending` once the address is confirmed", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, token } = await seedEvent(trx);
      await confirmSeededEvent(trx, id);
      const { deps, sent } = sending(trx);
      expect(await correctAddress(id, { adminToken: token }, anAddress(), deps)).toEqual({ ok: false, error: "notPending" });
      expect(sent).toEqual([]);
    });
  });

  it("answers `eventEnded` for an anonymised event", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await pendingEvent(trx);
      await trx.updateTable("event").set({ anonymised_at: new Date(), admin_token_hash: null }).where("id", "=", id).execute();
      const { deps, sent } = sending(trx);
      expect(await correctAddress(id, proof, anAddress(), deps)).toEqual({ ok: false, error: "eventEnded" });
      expect(sent).toEqual([]);
    });
  });

  it.each([
    ["an unknown event", generatePublicId()],
    ["a malformed id", "../../x"],
    ["an id that is not a string", 42],
  ])("answers `eventNotFound` for %s", async (_, id) => {
    await withRollbackRecordingSends(async (trx) => {
      const { deps, sent } = sending(trx);
      expect(await correctAddress(id, { adminToken: "AAAAAAAAAAAAAAAAAAAAAA" }, anAddress(), deps)).toEqual({ ok: false, error: "eventNotFound" });
      expect(sent).toEqual([]);
    });
  });

  it("logs under its own words when the email cannot be written, and logs no address, no token", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, email, token, proof, firstLink } = await pendingEvent(trx);
      const fixed = anAddress();
      const { deps } = sending(trx);
      await correctAddress(id, proof, fixed, { ...deps, origin: "not an origin" });
      expect(logs).toEqual([["fixEmail: the email could not be written"]]);
      const written = JSON.stringify(logs);
      for (const secret of [email, fixed, token, firstLink]) expect(written).not.toContain(secret);
    });
  });
});

/*
 * The access, the purge and the other links are decided under the Event's lock: on committed
 * data, through two connections.
 */
describe("correctAddress, under the Event's lock (committed data)", () => {
  it("answers eventEnded for an event anonymised while the correction waited for its lock; nothing is sent", async () => {
    await withCommittedAddresses((_, address) =>
      withCommittedEvent(async (db, eventId, token) => {
        await seedPendingSend(db, eventId, { email: address(), status: "sent", at: new Date(Date.now() - HOUR) });
        const { deps, sent } = sending(db);
        const answer = await whileHeld(
          db,
          async (trx) => {
            await lockEvent(trx, eventId, "noKeyUpdate");
            await anonymiseEvent(trx, eventId);
          },
          (own) => correctAddress(eventId, { adminToken: token }, address(), { ...deps, db: own }),
        );
        expect(answer).toEqual({ ok: false, error: "eventEnded" });
        expect(sent).toEqual([]);
        expect(await sendsFor(db, eventId)).toEqual([]);
      }),
    );
  });
});
