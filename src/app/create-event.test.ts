import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findLink } from "@/db/email-links";
import type { Database } from "@/db/schema";
import { anAddress, seedAccount, seedSends, seedSession, withRollbackRecordingSends } from "@/db/test-accounts";
import { SESSION_LIFETIME_MS } from "@/domain/account-rules";
import { hashToken } from "@/domain/token-hash";
import { CONFIRMATIONS_PER_ADDRESS, GLOBAL_SENDS_PER_HOUR } from "@/domain/send-limits";
import type { Brevo, Email, SendAnswer } from "@/email/brevo";
import type { Locale } from "@/i18n/locales";
import { createEventFor, type Creation } from "./create-event";

const DAY = 24 * 60 * 60_000;
const ORIGIN = "https://fullcar.test";
/** A title nothing else writes: looked for where it must not go (OA3.2). */
const TITLE = "Zorglub tournoi 4729";

/** The event a month from now, so that the server's bounds always take it. */
function fields(extra: Record<string, unknown> = {}) {
  const date = new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10);
  return { title: TITLE, location: "Gymnase Jean Macé", allerDate: date, allerTime: "07:30", ...extra };
}

/** Every line written to the console, by any of its methods. */
let logs: unknown[][];
beforeEach(() => {
  logs = [];
  for (const level of ["log", "info", "warn", "error", "debug", "trace"] as const) {
    vi.spyOn(console, level).mockImplementation((...args) => void logs.push(args));
  }
});
afterEach(() => vi.restoreAllMocks());

/**
 * A creation on `db`, at the real clock, with a Brevo that answers `answer` (a promise left
 * pending never answers), and the tasks Next's `after()` would run once the answer has gone,
 * kept to be run by the test. Under withRollbackRecordingSends: it may record a send.
 */
function creation(db: Kysely<Database>, answer: () => Promise<SendAnswer> = async () => ({ state: "sent" }), locale: Locale = "fr") {
  const sent: Email[] = [];
  const brevo: Brevo = { send: (email) => (sent.push(email), answer()) };
  const later: (() => Promise<void>)[] = [];
  const now = new Date();
  const deps: Creation = { db, now, locale, origin: ORIGIN, brevo, later: (task) => void later.push(task) };
  return { deps, sent, later, runLater: () => Promise.all(later.map((task) => task())) };
}

const eventRow = (db: Kysely<Database>, id: string) =>
  db
    .selectFrom("event")
    .select(["account_id", "confirmed_at", "pending_email", "send_status", "send_status_at"])
    .where("id", "=", id)
    .executeTakeFirstOrThrow();

const linksOf = (db: Kysely<Database>, id: string) =>
  db.selectFrom("email_link").select(["token_hash", "kind"]).where("event_id", "=", id).execute();

const sendsTo = (db: Kysely<Database>, email: string) =>
  db.selectFrom("email_send").select(["kind", "event_id"]).where("email", "=", email).execute();

const eventsTitled = async (db: Kysely<Database>) =>
  (await db.selectFrom("event").select("id").where("title", "=", TITLE).execute()).length;

/** The token of the confirmation link, read from the email's fallback line: after `#`, never in a path or query. */
function tokenIn(email: Email): string {
  const match = new RegExp(`${ORIGIN}/connexion/confirmer#([A-Za-z0-9_-]{22})(?![A-Za-z0-9_-])`).exec(email.text);
  if (!match) throw new Error("expected a confirmation link in the email");
  return match[1]!;
}

async function created(db: Kysely<Database>, input: unknown, deps: Creation) {
  const result = await createEventFor(input, deps);
  if (!result.ok) throw new Error(`expected an event, got ${JSON.stringify(result.errors)}`);
  return result;
}

describe("createEventFor, without an address nor a session (OA1.4, OA1.1)", () => {
  it.each<[string, Record<string, unknown>]>([
    ["no address, no session", {}],
    ["an empty address", { email: "" }],
    ["a null address", { email: null }],
    ["an empty session and no address", { session: null }],
  ])("creates nothing for %s, and asks for the address", async (_, extra) => {
    await withRollbackRecordingSends(async (trx) => {
      const { deps, later, sent } = creation(trx);
      expect(await createEventFor(fields(extra), deps)).toEqual({ ok: false, errors: { email: "required" } });
      expect(await createEventFor(fields({ ...extra, title: "" }), deps)).toEqual({
        ok: false,
        errors: { title: "required", email: "required" },
      });
      expect(await eventsTitled(trx)).toBe(0);
      expect(later).toEqual([]);
      expect(sent).toEqual([]);
    });
  });
});

describe("createEventFor, with an address (OA1.4, OA1.6, OA1.7, OA1.9)", () => {
  it.each<[string, unknown, string]>([
    ["empty", "", "required"],
    ["blank", "   ", "required"],
    ["« abc »", "abc", "invalid"],
    ["of 255 characters", `${"a".repeat(244)}@exemple.fr`, "tooLong"],
    ["not a string", 42, "invalid"],
  ])("OA1.4: refuses an address %s with the same rule as the form, and creates nothing", async (_, email, error) => {
    await withRollbackRecordingSends(async (trx) => {
      const { deps, later } = creation(trx);
      const result = await createEventFor(fields({ email }), deps);
      expect(result).toEqual({ ok: false, errors: { email: error } });
      expect(await eventsTitled(trx)).toBe(0);
      expect(later).toEqual([]);
    });
  });

  it("OA1.4: gives the address's error with the event's, in one answer", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const result = await createEventFor(fields({ title: "", email: "abc" }), creation(trx).deps);
      expect(result).toEqual({ ok: false, errors: { title: "required", email: "invalid" } });
    });
  });

  it("OA1.7: keeps the address pending, records the send and its link, and answers before the email goes", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { deps, sent, later } = creation(trx);
      const email = anAddress();
      const { id } = await created(trx, fields({ email: `  ${email.toUpperCase()} ` }), deps);
      expect(await eventRow(trx, id)).toEqual({
        account_id: null,
        confirmed_at: null,
        pending_email: email,
        send_status: "sending",
        send_status_at: deps.now,
      });
      expect(await sendsTo(trx, email)).toEqual([{ kind: "confirmation", event_id: id }]);
      expect(await linksOf(trx, id)).toEqual([{ token_hash: expect.any(Buffer), kind: "confirmation" }]);
      expect(sent).toEqual([]);
      expect(later).toHaveLength(1);
    });
  });

  it("OA1.6: once the answer has gone, sends one email to the address, in the page's language, with a link to its event", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { deps, sent, runLater } = creation(trx, undefined, "en");
      const email = anAddress();
      const { id, token } = await created(trx, fields({ email }), deps);
      await runLater();
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ to: email, subject: "Confirm your email address for Fullcar" });
      const linkToken = tokenIn(sent[0]!);
      expect(await findLink(trx, linkToken)).toMatchObject({ kind: "confirmation", eventId: id, usedAt: null });
      expect(linkToken).not.toBe(token);
      // OA3.2: nothing somebody typed goes in an email.
      expect(sent[0]!.text.includes(TITLE) || sent[0]!.html.includes(TITLE)).toBe(false);
    });
  });

  it.each<[string, SendAnswer, string]>([
    ["sent", { state: "sent" }, "sent"],
    ["failed, or past its 10 s", { state: "failed" }, "failed"],
  ])("OA1.7: keeps the result with the event when Brevo has %s", async (_, answer, status) => {
    await withRollbackRecordingSends(async (trx) => {
      const { deps, runLater } = creation(trx, async () => answer);
      const { id } = await created(trx, fields({ email: anAddress() }), deps);
      await runLater();
      const row = await eventRow(trx, id);
      expect(row.send_status).toBe(status);
      expect(row.send_status_at).not.toEqual(deps.now);
    });
  });

  it("OA1.2: answers while Brevo has not answered, the email still sending", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { deps, sent, runLater } = creation(trx, () => new Promise<SendAnswer>(() => {}));
      const { id } = await created(trx, fields({ email: anAddress() }), deps);
      void runLater();
      await vi.waitFor(() => expect(sent).toHaveLength(1));
      expect((await eventRow(trx, id)).send_status).toBe("sending");
    });
  });

  it("OA1.10: leaves a status written since by another send as it is", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { deps, runLater } = creation(trx, async () => ({ state: "failed" }));
      const { id } = await created(trx, fields({ email: anAddress() }), deps);
      const resentAt = new Date(deps.now.getTime() + 60_000);
      await trx.updateTable("event").set({ send_status: "sending", send_status_at: resentAt }).where("id", "=", id).execute();
      await runLater();
      expect(await eventRow(trx, id)).toMatchObject({ send_status: "sending", send_status_at: resentAt });
    });
  });

  it("OA1.9: the 6th creation in the hour with an address creates the event, sends nothing, and keeps address_limit", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { deps, sent, later } = creation(trx);
      const email = anAddress();
      await seedSends(trx, CONFIRMATIONS_PER_ADDRESS, { kind: "confirmation", email, sentAt: deps.now });
      const { id } = await created(trx, fields({ email }), deps);
      expect(await eventRow(trx, id)).toMatchObject({ pending_email: email, send_status: "address_limit", send_status_at: deps.now });
      expect(await sendsTo(trx, email)).toHaveLength(CONFIRMATIONS_PER_ADDRESS);
      expect(await linksOf(trx, id)).toEqual([]);
      expect(later).toEqual([]);
      expect(sent).toEqual([]);
    });
  });

  // Decision of the review of #623: nothing went out, as at the limit of an address.
  it("keeps address_limit when the global cap stops the email, and sends nothing", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { deps, later } = creation(trx);
      await seedSends(trx, GLOBAL_SENDS_PER_HOUR, { kind: "login", email: () => anAddress(), sentAt: deps.now });
      const email = anAddress();
      const { id } = await created(trx, fields({ email }), deps);
      expect((await eventRow(trx, id)).send_status).toBe("address_limit");
      expect(await sendsTo(trx, email)).toEqual([]);
      expect(await linksOf(trx, id)).toEqual([]);
      expect(later).toEqual([]);
    });
  });

  it("OA11.1: keeps the link's token out of the answer, the database and the logs", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { deps, sent, runLater } = creation(trx);
      const email = anAddress();
      const result = await created(trx, fields({ email }), deps);
      await runLater();
      const linkToken = tokenIn(sent[0]!);
      expect(Object.keys(result).sort()).toEqual(["id", "ok", "token"]);
      expect(JSON.stringify(result).includes(linkToken)).toBe(false);
      const links = await linksOf(trx, result.id);
      expect(links.map((link) => link.token_hash.toString("hex"))).toEqual([hashToken(linkToken)]);
      expect(logs).toEqual([]);
    });
  });

  it("OA11.1: logs fixed words only when the result cannot be stored", async () => {
    await withRollbackRecordingSends(async (trx) => {
      let broken = false;
      const db = new Proxy(trx, {
        get(target, property) {
          if (broken) throw Object.assign(new Error(`relation "event": ${TITLE}`), { code: "57P01" });
          const value: unknown = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      const { deps, runLater } = creation(db);
      await created(db, fields({ email: anAddress() }), deps);
      broken = true;
      await runLater();
      expect(logs).toEqual([["createEvent: the result of the email could not be stored (SQLSTATE 57P01)"]]);
    });
  });
});

describe("createEventFor, with a session (OA1.3, OA1.5)", () => {
  it("OA1.3: makes the event its account's, confirmed, and sends nothing", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const email = anAddress();
      const accountId = await seedAccount(trx, { email });
      const session = await seedSession(trx, accountId);
      const { deps, sent, later } = creation(trx);
      const { id } = await created(trx, fields({ session }), deps);
      expect(await eventRow(trx, id)).toEqual({
        account_id: accountId,
        confirmed_at: deps.now,
        pending_email: null,
        send_status: null,
        send_status_at: null,
      });
      expect(await sendsTo(trx, email)).toEqual([]);
      expect(await linksOf(trx, id)).toEqual([]);
      expect(later).toEqual([]);
      expect(sent).toEqual([]);
    });
  });

  it("OA1.3: takes the live session over an address sent with it", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const accountId = await seedAccount(trx);
      const session = await seedSession(trx, accountId);
      const { deps, later } = creation(trx);
      const { id } = await created(trx, fields({ session, email: "abc" }), deps);
      expect((await eventRow(trx, id)).account_id).toBe(accountId);
      expect(later).toEqual([]);
    });
  });

  it.each<[string, (db: Kysely<Database>) => Promise<unknown>]>([
    ["closed by « Se déconnecter »", async (db) => {
      const token = await seedSession(db, await seedAccount(db));
      await db.deleteFrom("session").where("token_hash", "=", Buffer.from(hashToken(token), "hex")).execute();
      return token;
    }],
    ["ended 90 days after its last visit", async (db) => {
      const lastVisitAt = new Date(Date.now() - SESSION_LIFETIME_MS - 60_000);
      return seedSession(db, await seedAccount(db), { createdAt: lastVisitAt, lastVisitAt });
    }],
    ["unknown", async () => "AAAAAAAAAAAAAAAAAAAAAA"],
    ["not a string", async () => 42],
  ])("OA1.5: creates nothing for a session %s, and asks for the address", async (_, sessionOf) => {
    await withRollbackRecordingSends(async (trx) => {
      const session = await sessionOf(trx);
      const { deps, later } = creation(trx);
      expect(await createEventFor(fields({ session }), deps)).toEqual({ ok: false, errors: { email: "sessionEnded" } });
      expect(await createEventFor(fields({ session, title: "" }), deps)).toEqual({
        ok: false,
        errors: { title: "required", email: "sessionEnded" },
      });
      expect(await eventsTitled(trx)).toBe(0);
      expect(later).toEqual([]);
    });
  });

  it("OA1.5: with the address typed after the session ended, creates the event pending on it", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const email = anAddress();
      const { deps, later } = creation(trx);
      const { id } = await created(trx, fields({ session: "AAAAAAAAAAAAAAAAAAAAAA", email }), deps);
      expect(await eventRow(trx, id)).toMatchObject({ account_id: null, pending_email: email, send_status: "sending" });
      expect(later).toHaveLength(1);
    });
  });
});
