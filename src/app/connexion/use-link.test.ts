import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { anonymiseEvent } from "@/db/day-thirty";
import { findLink } from "@/db/email-links";
import type { Database } from "@/db/schema";
import { findSession } from "@/db/sessions";
import { anAddress, seedAccount, seedLink, seedSends, seedSession, withCommittedAddresses, withRollbackRecordingSends } from "@/db/test-accounts";
import { whileHeld, withCommittedEvent } from "@/db/test-committed";
import { confirmSeededEvent, seedEvent, seedPendingSend } from "@/db/test-events";
import { CONFIRMATIONS_PER_EVENT } from "@/domain/send-limits";
import type { Brevo, Email, SendAnswer } from "@/email/brevo";
import type { Locale } from "@/i18n/locales";
import { openWithConfirmationLink, openWithLoginLink, resendExpiredConfirmation, type Resending } from "./use-link";

const ORIGIN = "https://fullcar.test";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms);

/** Every line written to the console, by any of its methods: no address, no token among them. */
let logs: string[];
beforeEach(() => {
  logs = [];
  for (const level of ["log", "info", "warn", "error", "debug", "trace"] as const) {
    vi.spyOn(console, level).mockImplementation((...args) => void logs.push(args.map(String).join(" ")));
  }
});
afterEach(() => vi.restoreAllMocks());

const eventRow = (db: Kysely<Database>, id: string) =>
  db.selectFrom("event").select(["account_id", "confirmed_at", "pending_email", "send_status"]).where("id", "=", id).executeTakeFirstOrThrow();
const accountsOf = (db: Kysely<Database>, email: string) =>
  db.selectFrom("account").select(["id", "locale"]).where("email", "=", email).execute();

/** A pending event waiting on `email`, its first email sent an hour ago, and a confirmation link made `age` ago. */
async function pendingWithLink(db: Kysely<Database>, email = anAddress(), age = MINUTE) {
  const { id } = await seedEvent(db);
  await seedPendingSend(db, id, { email, status: "sent", at: ago(HOUR) });
  const token = await seedLink(db, { kind: "confirmation", eventId: id }, { createdAt: ago(age) });
  return { id, email, token };
}

/** The event confirmed by another link: its address and the result of its email cleared, an account of its own. */
async function alreadyConfirmed(db: Kysely<Database>, id: string) {
  await db.updateTable("event").set({ pending_email: null, send_status: null, send_status_at: null }).where("id", "=", id).execute();
  return confirmSeededEvent(db, id);
}

describe("openWithLoginLink (OA5.2, OA5.4, OA5.5, OA5.7, OA5.9)", () => {
  it("opens a session of the link's account, and lands on Mes événements without a return event", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const email = anAddress();
      const accountId = await seedAccount(trx, { email });
      const token = await seedLink(trx, { kind: "login", accountId, returnEventId: null });
      const answer = await openWithLoginLink(trx, token);
      expect(answer).toMatchObject({ state: "opened", eventId: null });
      if (answer.state !== "opened") throw new Error("expected a session");
      expect((await findSession(trx, answer.session))?.id).toBe(accountId);
      expect(await findLink(trx, token)).toMatchObject({ usedAt: expect.any(Date) });
    });
  });

  it("OA4.4: lands on the event the sign-in was asked from", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const accountId = await seedAccount(trx);
      const { id } = await seedEvent(trx);
      const token = await seedLink(trx, { kind: "login", accountId, returnEventId: id });
      expect(await openWithLoginLink(trx, token)).toMatchObject({ state: "opened", eventId: id });
    });
  });

  it("OA5.9: a session open with A, the link of B opens a session of B", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const a = await seedAccount(trx);
      const b = await seedAccount(trx);
      const sessionOfA = await seedSession(trx, a);
      const token = await seedLink(trx, { kind: "login", accountId: b, returnEventId: null });
      const answer = await openWithLoginLink(trx, token);
      if (answer.state !== "opened") throw new Error("expected a session");
      expect(answer.session).not.toBe(sessionOfA);
      expect((await findSession(trx, answer.session))?.id).toBe(b);
      // The browser replaces its token; A's session is not this link's to end.
      expect((await findSession(trx, sessionOfA))?.id).toBe(a);
    });
  });

  it("does not attach a pending event of the account's address (decision 3)", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const email = anAddress();
      const accountId = await seedAccount(trx, { email });
      const { id } = await pendingWithLink(trx, email);
      const token = await seedLink(trx, { kind: "login", accountId, returnEventId: null });
      expect(await openWithLoginLink(trx, token)).toMatchObject({ state: "opened" });
      expect(await eventRow(trx, id)).toMatchObject({ account_id: null, confirmed_at: null, pending_email: email });
    });
  });

  it("OA5.4: a link used a second time says so, and opens no session", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const accountId = await seedAccount(trx);
      const token = await seedLink(trx, { kind: "login", accountId, returnEventId: null });
      expect(await openWithLoginLink(trx, token)).toMatchObject({ state: "opened" });
      expect(await openWithLoginLink(trx, token)).toEqual({ state: "used" });
      const sessions = await trx.selectFrom("session").select("token_hash").where("account_id", "=", accountId).execute();
      expect(sessions).toHaveLength(1);
    });
  });

  it("OA5.5: a link made 61 minutes ago has expired; 59 minutes ago it serves", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const accountId = await seedAccount(trx);
      const old = await seedLink(trx, { kind: "login", accountId, returnEventId: null }, { createdAt: ago(61 * MINUTE) });
      const recent = await seedLink(trx, { kind: "login", accountId, returnEventId: null }, { createdAt: ago(59 * MINUTE) });
      expect(await openWithLoginLink(trx, old)).toEqual({ state: "expired" });
      expect(await openWithLoginLink(trx, recent)).toMatchObject({ state: "opened" });
    });
  });

  it.each([
    ["absent", undefined],
    ["empty", ""],
    ["not a string", 42],
    ["unknown", "A".repeat(22)],
  ])("OA5.7: a token that is %s is not valid", async (_, token) => {
    await withRollbackRecordingSends(async (trx) => {
      expect(await openWithLoginLink(trx, token)).toEqual({ state: "invalid" });
    });
  });

  it("OA5.7: a token truncated by one character is not valid, and the link stays unused", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const accountId = await seedAccount(trx);
      const token = await seedLink(trx, { kind: "login", accountId, returnEventId: null });
      expect(await openWithLoginLink(trx, token.slice(0, -1))).toEqual({ state: "invalid" });
      expect(await findLink(trx, token)).toMatchObject({ usedAt: null });
    });
  });

  it("a confirmation link is not valid here, and stays unused: a sign-in confirms nothing", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, token } = await pendingWithLink(trx);
      expect(await openWithLoginLink(trx, token)).toEqual({ state: "invalid" });
      expect(await findLink(trx, token)).toMatchObject({ usedAt: null });
      expect(await eventRow(trx, id)).toMatchObject({ confirmed_at: null });
    });
  });

  it("lands on Mes événements when the return event was deleted before the link is used (the foreign key emptied it)", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const accountId = await seedAccount(trx);
      const { id } = await seedEvent(trx);
      const token = await seedLink(trx, { kind: "login", accountId, returnEventId: id });
      await trx.deleteFrom("event").where("id", "=", id).execute();
      expect(await openWithLoginLink(trx, token)).toMatchObject({ state: "opened", eventId: null });
    });
  });

  it("lands on Mes événements when the return event is deleted after the link is read, before its key is held", async () => {
    await withCommittedAddresses(async (db, address) => {
      const accountId = await seedAccount(db, { email: address() });
      const { id } = await seedEvent(db);
      const token = await seedLink(db, { kind: "login", accountId, returnEventId: id });
      // The deletion is not committed yet: the link still names the event, and the key waits for it.
      const answer = await whileHeld(
        db,
        (trx) => trx.deleteFrom("event").where("id", "=", id).execute(),
        (own) => openWithLoginLink(own, token),
      );
      expect(answer).toMatchObject({ state: "opened", eventId: null });
    });
  });

  it("OA5.10: logs nothing, and the answer to an invalid link carries no token", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const accountId = await seedAccount(trx);
      const token = await seedLink(trx, { kind: "login", accountId, returnEventId: null });
      const answer = await openWithLoginLink(trx, token);
      await openWithLoginLink(trx, token);
      expect(logs).toEqual([]);
      expect(JSON.stringify(await openWithLoginLink(trx, token))).not.toContain(token);
      expect(answer).toMatchObject({ state: "opened" });
    });
  });

  it("two requests at once with one link: one session, the other finds it used", async () => {
    await withCommittedAddresses(async (db, address) => {
      const accountId = await seedAccount(db, { email: address() });
      const token = await seedLink(db, { kind: "login", accountId, returnEventId: null });
      const answers = await Promise.all([openWithLoginLink(db, token), openWithLoginLink(db, token)]);
      expect(answers.map((answer) => answer.state).sort()).toEqual(["opened", "used"]);
      const sessions = await db.selectFrom("session").select("token_hash").where("account_id", "=", accountId).execute();
      expect(sessions).toHaveLength(1);
    });
  });
});

describe("openWithConfirmationLink (OA5.3, OA5.4, OA5.6, decision 3)", () => {
  it("OA5.3: confirms the event for the address's new account, and opens a session on it", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, email, token } = await pendingWithLink(trx);
      const answer = await openWithConfirmationLink(trx, token, "en");
      expect(answer).toMatchObject({ state: "opened", eventId: id });
      if (answer.state !== "opened") throw new Error("expected a session");
      const [account] = await accountsOf(trx, email);
      expect(account).toMatchObject({ locale: "en" });
      expect(await eventRow(trx, id)).toEqual({
        account_id: account!.id,
        confirmed_at: expect.any(Date),
        pending_email: null,
        send_status: null,
      });
      const session = await findSession(trx, answer.session);
      expect(session).toMatchObject({ id: account!.id, email });
      expect(await findLink(trx, token)).toMatchObject({ usedAt: expect.any(Date) });
    });
  });

  it("attaches the event to the account the address already has, and creates no second one", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const email = anAddress();
      const accountId = await seedAccount(trx, { email, locale: "fr" });
      const { id, token } = await pendingWithLink(trx, email);
      const answer = await openWithConfirmationLink(trx, token, "en");
      if (answer.state !== "opened") throw new Error("expected a session");
      expect(await accountsOf(trx, email)).toEqual([{ id: accountId, locale: "fr" }]);
      expect((await eventRow(trx, id)).account_id).toBe(accountId);
      expect((await findSession(trx, answer.session))?.id).toBe(accountId);
    });
  });

  it("decision 3: the link attaches its event only, not the other pending events of the address", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const email = anAddress();
      const first = await pendingWithLink(trx, email);
      const second = await pendingWithLink(trx, email);
      expect(await openWithConfirmationLink(trx, first.token, "fr")).toMatchObject({ state: "opened", eventId: first.id });
      expect(await eventRow(trx, first.id)).toMatchObject({ confirmed_at: expect.any(Date), pending_email: null });
      expect(await eventRow(trx, second.id)).toMatchObject({ account_id: null, confirmed_at: null, pending_email: email });
      expect(await findLink(trx, second.token)).toMatchObject({ usedAt: null });
    });
  });

  it("decision 3: another link of the same event is then used (OA5.4), and confirms nothing more", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, token } = await pendingWithLink(trx);
      const resent = await seedLink(trx, { kind: "confirmation", eventId: id });
      expect(await openWithConfirmationLink(trx, token, "fr")).toMatchObject({ state: "opened" });
      expect(await openWithConfirmationLink(trx, resent, "fr")).toEqual({ state: "used" });
      expect(await openWithConfirmationLink(trx, token, "fr")).toEqual({ state: "used" });
    });
  });

  it("OA5.4: an event confirmed in another way says used, and no session opens", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, token } = await pendingWithLink(trx);
      await alreadyConfirmed(trx, id);
      await seedSession(trx, await seedAccount(trx));
      // The database is shared, but the transaction reads one snapshot (REPEATABLE READ): sessions committed by other
      // test files meanwhile are not seen, so the whole table is counted, whichever account a session would open on.
      const count = async () => Number((await trx.selectFrom("session").select((eb) => eb.fn.countAll().as("n")).executeTakeFirstOrThrow()).n);
      const before = await count();
      expect(await openWithConfirmationLink(trx, token, "fr")).toEqual({ state: "used" });
      expect(await count()).toBe(before);
    });
  });

  it("OA5.6: a link made 7 days and a minute ago has expired, and the event stays pending", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, email, token } = await pendingWithLink(trx, anAddress(), 7 * DAY + MINUTE);
      expect(await openWithConfirmationLink(trx, token, "fr")).toEqual({ state: "expired" });
      expect(await eventRow(trx, id)).toMatchObject({ account_id: null, pending_email: email });
      expect(await accountsOf(trx, email)).toEqual([]);
    });
  });

  it("a link made 6 days 23 hours ago still serves", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { token } = await pendingWithLink(trx, anAddress(), 7 * DAY - HOUR);
      expect(await openWithConfirmationLink(trx, token, "fr")).toMatchObject({ state: "opened" });
    });
  });

  it.each([
    ["absent", undefined],
    ["not a string", {}],
    ["unknown", "B".repeat(22)],
  ])("OA5.7: a token that is %s is not valid", async (_, token) => {
    await withRollbackRecordingSends(async (trx) => {
      expect(await openWithConfirmationLink(trx, token, "fr")).toEqual({ state: "invalid" });
    });
  });

  it("OA5.7: a token truncated by one character is not valid, and nothing is confirmed", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, token } = await pendingWithLink(trx);
      expect(await openWithConfirmationLink(trx, token.slice(0, -1), "fr")).toEqual({ state: "invalid" });
      expect(await eventRow(trx, id)).toMatchObject({ confirmed_at: null });
    });
  });

  it("a sign-in link is not valid here, and stays unused", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const accountId = await seedAccount(trx);
      const token = await seedLink(trx, { kind: "login", accountId, returnEventId: null });
      expect(await openWithConfirmationLink(trx, token, "fr")).toEqual({ state: "invalid" });
      expect(await findLink(trx, token)).toMatchObject({ usedAt: null });
    });
  });

  it("an anonymised event's link is not valid: nothing is confirmed, no account is created", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, email } = await pendingWithLink(trx);
      await anonymiseEvent(trx, id);
      // Anonymising deletes the event's links: one that is there anyway opens nothing.
      const token = await seedLink(trx, { kind: "confirmation", eventId: id });
      expect(await openWithConfirmationLink(trx, token, "fr")).toEqual({ state: "invalid" });
      expect(await accountsOf(trx, email)).toEqual([]);
    });
  });

  it("OA5.9: a session open with A, the link of B's event opens a session of B", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const a = await seedAccount(trx);
      const sessionOfA = await seedSession(trx, a);
      const { email, token } = await pendingWithLink(trx);
      const answer = await openWithConfirmationLink(trx, token, "fr");
      if (answer.state !== "opened") throw new Error("expected a session");
      expect((await findSession(trx, answer.session))?.email).toBe(email);
      expect((await findSession(trx, sessionOfA))?.id).toBe(a);
    });
  });

  it("OA5.10: logs nothing", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { token } = await pendingWithLink(trx);
      await openWithConfirmationLink(trx, token, "fr");
      await openWithConfirmationLink(trx, token, "fr");
      await openWithConfirmationLink(trx, token.slice(1), "fr");
      expect(logs).toEqual([]);
    });
  });

  it("two requests at once with one link: one account, one session, the other finds it used", async () => {
    await withCommittedAddresses((_, address) =>
      withCommittedEvent(async (db, eventId) => {
        const email = address();
        await seedPendingSend(db, eventId, { email, status: "sent", at: ago(HOUR) });
        const token = await seedLink(db, { kind: "confirmation", eventId });
        const answers = await Promise.all([
          openWithConfirmationLink(db, token, "fr"),
          openWithConfirmationLink(db, token, "fr"),
        ]);
        expect(answers.map((answer) => answer.state).sort()).toEqual(["opened", "used"]);
        const accounts = await accountsOf(db, email);
        expect(accounts).toHaveLength(1);
        const sessions = await db.selectFrom("session").select("token_hash").where("account_id", "=", accounts[0]!.id).execute();
        expect(sessions).toHaveLength(1);
      }),
    );
  });
});

/** A resend with a Brevo that answers `answer`, at the real clock, and the emails it was given. */
function resending(db: Kysely<Database>, answer: SendAnswer["state"] = "sent", locale: Locale = "fr") {
  const sent: Email[] = [];
  const brevo: Brevo = { send: async (email) => (sent.push(email), { state: answer }) };
  const deps: Resending = { db, now: new Date(), locale, origin: ORIGIN, brevo };
  return { deps, sent };
}

function tokenIn(email: Email): string {
  const match = new RegExp(`${ORIGIN}/connexion/confirmer#([A-Za-z0-9_-]{22})(?![A-Za-z0-9_-])`).exec(email.text);
  if (!match) throw new Error("expected a confirmation link in the email");
  return match[1]!;
}

describe("resendExpiredConfirmation (OA5.6)", () => {
  it("sends a new confirmation email to the pending address, with a new link that serves the event", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, email, token } = await pendingWithLink(trx, anAddress(), 7 * DAY + MINUTE);
      const { deps, sent } = resending(trx, "sent", "en");
      expect(await resendExpiredConfirmation(token, deps)).toEqual({ state: "sent" });
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ to: email, subject: "Confirm your email address for Fullcar" });
      const fresh = tokenIn(sent[0]!);
      expect(fresh).not.toBe(token);
      expect(await findLink(trx, fresh)).toMatchObject({ kind: "confirmation", eventId: id, usedAt: null });
      // The expired link stays what it was.
      expect(await openWithConfirmationLink(trx, token, "fr")).toEqual({ state: "expired" });
      expect(await openWithConfirmationLink(trx, fresh, "fr")).toMatchObject({ state: "opened", eventId: id });
    });
  });

  it("keeps the result of the new email with the event, replacing the one before", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, token } = await pendingWithLink(trx, anAddress(), 8 * DAY);
      const { deps } = resending(trx, "failed");
      expect(await resendExpiredConfirmation(token, deps)).toEqual({ state: "failed" });
      expect(await eventRow(trx, id)).toMatchObject({ send_status: "failed" });
    });
  });

  it("OA2.4: a limit that stops it sends nothing, and leaves no link", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, token } = await pendingWithLink(trx, anAddress(), 8 * DAY);
      await seedSends(trx, CONFIRMATIONS_PER_EVENT, { kind: "confirmation", email: anAddress(), eventId: id });
      const { deps, sent } = resending(trx);
      expect(await resendExpiredConfirmation(token, deps)).toEqual({ state: "tooMany" });
      expect(sent).toEqual([]);
      const links = await trx.selectFrom("email_link").select("token_hash").where("event_id", "=", id).execute();
      expect(links).toHaveLength(1);
    });
  });

  it("sends nothing for a link that has not expired", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { token } = await pendingWithLink(trx);
      const { deps, sent } = resending(trx);
      expect(await resendExpiredConfirmation(token, deps)).toEqual({ state: "invalid" });
      expect(sent).toEqual([]);
    });
  });

  it("says used for an event that is confirmed since, and sends nothing", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, token } = await pendingWithLink(trx, anAddress(), 8 * DAY);
      await alreadyConfirmed(trx, id);
      const { deps, sent } = resending(trx);
      expect(await resendExpiredConfirmation(token, deps)).toEqual({ state: "used" });
      expect(sent).toEqual([]);
    });
  });

  it.each([
    ["unknown", () => "C".repeat(22)],
    ["absent", () => undefined],
    ["not a string", () => 7],
  ])("OA5.7: a token that is %s is not valid", async (_, token) => {
    await withRollbackRecordingSends(async (trx) => {
      const { deps, sent } = resending(trx);
      expect(await resendExpiredConfirmation(token(), deps)).toEqual({ state: "invalid" });
      expect(sent).toEqual([]);
    });
  });

  it("sends nothing for a sign-in link, expired or not", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const accountId = await seedAccount(trx);
      const token = await seedLink(trx, { kind: "login", accountId, returnEventId: null }, { createdAt: ago(2 * HOUR) });
      const { deps, sent } = resending(trx);
      expect(await resendExpiredConfirmation(token, deps)).toEqual({ state: "invalid" });
      expect(sent).toEqual([]);
    });
  });

  it("sends nothing for an anonymised event", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id } = await pendingWithLink(trx, anAddress(), 8 * DAY);
      await anonymiseEvent(trx, id);
      const token = await seedLink(trx, { kind: "confirmation", eventId: id }, { createdAt: ago(8 * DAY) });
      const { deps, sent } = resending(trx);
      expect(await resendExpiredConfirmation(token, deps)).toEqual({ state: "invalid" });
      expect(sent).toEqual([]);
    });
  });

  it("OA5.10: logs neither the address nor a token", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { token } = await pendingWithLink(trx, anAddress(), 8 * DAY);
      const { deps } = resending(trx);
      await resendExpiredConfirmation(token, deps);
      expect(logs).toEqual([]);
    });
  });
});
