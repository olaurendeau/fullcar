import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findLink } from "@/db/email-links";
import type { Database } from "@/db/schema";
import { anAddress, seedAccount, seedSends, seedSession, withRollbackRecordingSends } from "@/db/test-accounts";
import { confirmSeededEvent, seedEvent, seedPendingSend } from "@/db/test-events";
import { generatePublicId } from "@/domain/public-id";
import { CONFIRMATIONS_PER_ADDRESS,CONFIRMATIONS_PER_EVENT, GLOBAL_SENDS_PER_HOUR } from "@/domain/send-limits";
import type { Brevo, Email, SendAnswer } from "@/email/brevo";
import type { Locale } from "@/i18n/locales";
import { resendConfirmation, type Resending } from "./pending-email";

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

/** A resend on `db`, at the real clock, with a Brevo that answers `answer`, and the emails it was given. */
function resending(db: Kysely<Database>, answer: () => Promise<SendAnswer> = async () => ({ state: "sent" }), locale: Locale = "fr") {
  const sent: Email[] = [];
  const brevo: Brevo = { send: (email) => (sent.push(email), answer()) };
  const deps: Resending = { db, now: new Date(), locale, origin: ORIGIN, brevo };
  return { deps, sent };
}

/** The token of the confirmation link in the email, after `#`: never in a path or a query. */
function tokenIn(email: Email): string {
  const match = new RegExp(`${ORIGIN}/connexion/confirmer#([A-Za-z0-9_-]{22})(?![A-Za-z0-9_-])`).exec(email.text);
  if (!match) throw new Error("expected a confirmation link in the email");
  return match[1]!;
}

const eventRow = (db: Kysely<Database>, id: string) =>
  db.selectFrom("event").select(["pending_email", "send_status", "send_status_at"]).where("id", "=", id).executeTakeFirstOrThrow();

const linksOf = (db: Kysely<Database>, id: string) => db.selectFrom("email_link").select("kind").where("event_id", "=", id).execute();

const sendsFor = (db: Kysely<Database>, id: string) => db.selectFrom("email_send").select("kind").where("event_id", "=", id).execute();

/** A pending event of the browser holding `token`, its first email sent an hour ago unless `status` says otherwise. */
async function pendingEvent(db: Kysely<Database>, email = anAddress(), status: "sent" | "failed" | "address_limit" = "sent") {
  const seeded = await seedEvent(db);
  await seedPendingSend(db, seeded.id, { email, status, at: new Date(Date.now() - HOUR) });
  return { ...seeded, email, proof: { adminToken: seeded.token } };
}

describe("resendConfirmation (OA2.4)", () => {
  it("sends one more email to the address, in the page's language, with a new link that serves the event", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, email, proof } = await pendingEvent(trx);
      const { deps, sent } = resending(trx, undefined, "en");
      expect(await resendConfirmation(id, proof, deps)).toEqual({ ok: true, pending: { email, send: "sent" } });
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ to: email, subject: "Confirm your email address for Fullcar" });
      expect(await findLink(trx, tokenIn(sent[0]!))).toMatchObject({ kind: "confirmation", eventId: id, usedAt: null });
      expect(await sendsFor(trx, id)).toEqual([{ kind: "confirmation" }]);
      expect(await linksOf(trx, id)).toEqual([{ kind: "confirmation" }]);
    });
  });

  it("keeps the links of the earlier emails valid, a new one beside them", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await pendingEvent(trx);
      const { deps, sent } = resending(trx);
      await resendConfirmation(id, proof, deps);
      await resendConfirmation(id, proof, deps);
      expect(sent).toHaveLength(2);
      expect(tokenIn(sent[0]!)).not.toBe(tokenIn(sent[1]!));
      for (const email of sent) expect(await findLink(trx, tokenIn(email))).toMatchObject({ usedAt: null });
    });
  });

  it.each<[string, "failed" | "address_limit"]>([
    ["a failure", "failed"],
    ["the limit of the address", "address_limit"],
  ])("OA1.10: a resend that goes replaces the result kept: %s", async (_, before) => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, email, proof } = await pendingEvent(trx, anAddress(), before);
      const { deps } = resending(trx);
      await resendConfirmation(id, proof, deps);
      expect(await eventRow(trx, id)).toMatchObject({ pending_email: email, send_status: "sent" });
    });
  });

  it("keeps and answers a failure when Brevo fails, the send counted all the same", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, email, proof } = await pendingEvent(trx);
      const { deps, sent } = resending(trx, async () => ({ state: "failed" }));
      expect(await resendConfirmation(id, proof, deps)).toEqual({ ok: true, pending: { email, send: "failed" } });
      expect(sent).toHaveLength(1);
      expect((await eventRow(trx, id)).send_status).toBe("failed");
      expect(await sendsFor(trx, id)).toHaveLength(1);
    });
  });

  it("writes `sending` before Brevo answers, and leaves the result of a later send as it is", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await pendingEvent(trx);
      let release: (answer: SendAnswer) => void = () => {};
      const { deps, sent } = resending(trx, () => new Promise<SendAnswer>((resolve) => (release = resolve)));
      const running = resendConfirmation(id, proof, deps);
      await vi.waitFor(() => expect(sent).toHaveLength(1));
      expect(await eventRow(trx, id)).toMatchObject({ send_status: "sending", send_status_at: deps.now });
      const later = new Date(deps.now.getTime() + 60_000);
      await trx.updateTable("event").set({ send_status: "sending", send_status_at: later }).where("id", "=", id).execute();
      release({ state: "sent" });
      await running;
      expect(await eventRow(trx, id)).toMatchObject({ send_status: "sending", send_status_at: later });
    });
  });

  it("OA2.4: stops at 3 confirmation emails in the hour for the event, the first one included, and sends nothing", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, email, proof } = await pendingEvent(trx);
      await seedSends(trx, 1, { kind: "confirmation", email, eventId: id, sentAt: new Date() });
      const { deps, sent } = resending(trx);
      for (let n = 0; n < CONFIRMATIONS_PER_EVENT - 1; n += 1) {
        expect(await resendConfirmation(id, proof, deps)).toMatchObject({ ok: true });
      }
      expect(await resendConfirmation(id, proof, deps)).toEqual({ ok: false, error: "tooMany" });
      expect(sent).toHaveLength(CONFIRMATIONS_PER_EVENT - 1);
      expect(await sendsFor(trx, id)).toHaveLength(CONFIRMATIONS_PER_EVENT);
      expect(await linksOf(trx, id)).toHaveLength(CONFIRMATIONS_PER_EVENT - 1);
    });
  });

  it("OA2.4: a limit leaves the result kept as it is", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, email, proof } = await pendingEvent(trx, anAddress(), "failed");
      await seedSends(trx, CONFIRMATIONS_PER_EVENT, { kind: "confirmation", email, eventId: id, sentAt: new Date() });
      const before = await eventRow(trx, id);
      expect(await resendConfirmation(id, proof, resending(trx).deps)).toEqual({ ok: false, error: "tooMany" });
      expect(await eventRow(trx, id)).toEqual(before);
    });
  });

  it("OA2.4: stops at the limit of the address, all events together (OA1.9)", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, email, proof } = await pendingEvent(trx);
      await seedSends(trx, CONFIRMATIONS_PER_ADDRESS, { kind: "confirmation", email, sentAt: new Date() });
      const { deps, sent } = resending(trx);
      expect(await resendConfirmation(id, proof, deps)).toEqual({ ok: false, error: "tooMany" });
      expect(sent).toEqual([]);
      expect(await linksOf(trx, id)).toEqual([]);
    });
  });

  it("OA2.4: stops at the global cap", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await pendingEvent(trx);
      await seedSends(trx, GLOBAL_SENDS_PER_HOUR, { kind: "login", email: () => anAddress(), sentAt: new Date() });
      const { deps, sent } = resending(trx);
      expect(await resendConfirmation(id, proof, deps)).toEqual({ ok: false, error: "tooMany" });
      expect(sent).toEqual([]);
    });
  });

  it("OA2.4: an hour later, the sends no longer count", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, email, proof } = await pendingEvent(trx);
      await seedSends(trx, CONFIRMATIONS_PER_EVENT, { kind: "confirmation", email, eventId: id, sentAt: new Date(Date.now() - HOUR - 1000) });
      expect(await resendConfirmation(id, proof, resending(trx).deps)).toMatchObject({ ok: true });
    });
  });
});

describe("resendConfirmation, who may ask", () => {
  it.each<[string, (event: { token: string }) => unknown]>([
    ["no proof", () => undefined],
    ["a body that is not an object", () => "abc"],
    ["no token", () => ({})],
    ["another token", () => ({ adminToken: "AAAAAAAAAAAAAAAAAAAAAA" })],
    ["a token that is not a string", () => ({ adminToken: 42 })],
  ])("refuses %s, and sends nothing", async (_, proof) => {
    await withRollbackRecordingSends(async (trx) => {
      const event = await pendingEvent(trx);
      const { deps, sent } = resending(trx);
      expect(await resendConfirmation(event.id, proof(event), deps)).toEqual({ ok: false, error: "invalid" });
      expect(sent).toEqual([]);
      expect(await sendsFor(trx, event.id)).toEqual([]);
    });
  });

  it("refuses the session of another account", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id } = await pendingEvent(trx);
      const session = await seedSession(trx, await seedAccount(trx));
      const { deps, sent } = resending(trx);
      expect(await resendConfirmation(id, { session }, deps)).toEqual({ ok: false, error: "invalid" });
      expect(sent).toEqual([]);
    });
  });

  it("answers `notPending` once the address is confirmed, and sends nothing", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, token } = await seedEvent(trx);
      await confirmSeededEvent(trx, id);
      const { deps, sent } = resending(trx);
      expect(await resendConfirmation(id, { adminToken: token }, deps)).toEqual({ ok: false, error: "notPending" });
      expect(sent).toEqual([]);
    });
  });

  it("answers `notPending` for an event without an address", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, token } = await seedEvent(trx);
      expect(await resendConfirmation(id, { adminToken: token }, resending(trx).deps)).toEqual({ ok: false, error: "notPending" });
    });
  });

  it("answers `eventEnded` for an anonymised event, whatever the proof", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await pendingEvent(trx);
      await trx.updateTable("event").set({ anonymised_at: new Date(), admin_token_hash: null }).where("id", "=", id).execute();
      const { deps, sent } = resending(trx);
      expect(await resendConfirmation(id, proof, deps)).toEqual({ ok: false, error: "eventEnded" });
      expect(sent).toEqual([]);
    });
  });

  it.each([["an unknown event", generatePublicId()],["a malformed id", "../../x"], ["an id that is not a string", 42]])(
    "answers `eventNotFound` for %s",
    async (_, id) => {
      await withRollbackRecordingSends(async (trx) => {
        const { deps, sent } = resending(trx);
        expect(await resendConfirmation(id, { adminToken: "AAAAAAAAAAAAAAAAAAAAAA" }, deps)).toEqual({ ok: false, error: "eventNotFound" });
        expect(sent).toEqual([]);
      });
    },
  );

  it("logs no address, no token", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, email, token, proof } = await pendingEvent(trx);
      const { deps, sent } = resending(trx, async () => ({ state: "failed" }));
      await resendConfirmation(id, proof, deps);
      const written = JSON.stringify(logs);
      for (const secret of [email, token, tokenIn(sent[0]!)]) expect(written).not.toContain(secret);
    });
  });
});
