import { InsertQueryNode, type Kysely, type KyselyPlugin } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readEventState } from "@/app/e/[id]/event-state";
import { readOrganiserState } from "@/app/e/[id]/organiser-state";
import { handOverEvent, type Handing } from "@/app/e/[id]/transfer";
import { readMyEvents } from "@/app/mes-evenements/my-events";
import { eraseAccount } from "@/db/accounts";
import { anonymiseEvent } from "@/db/day-thirty";
import { findLink } from "@/db/email-links";
import type { Database } from "@/db/schema";
import { findSession } from "@/db/sessions";
import { anAddress, seedAccount, seedLink, seedSession, withCommittedAddresses, withRollbackRecordingSends } from "@/db/test-accounts";
import { whileHeld, withCommittedEvent } from "@/db/test-committed";
import { confirmSeededEvent, seedEvent, seedTransfer } from "@/db/test-events";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import type { Brevo, Email } from "@/email/brevo";
import { openWithTransferLink, readTransferLink } from "./transfer-link";

/*
 * Epic #935, T8 (#946): the recipient reads the page of a transfer link, then accepts it,
 * OT3, OT4 and OT8. The events are confirmed by an account of their own, whose session (or
 * the creation browser's token) is the proof the one who hands over holds.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms);
const PHONES = ["06 11 11 11 11", "07 22 22 22 22"] as const;
/** The digits of a number without its leading 0: how a number is written, whatever its format. */
const digits = (text: string) => text.replace(/\D/g, "").replace(/^0/, "");

/** Every line written to the console, by any of its methods: no address, no token among them. */
let logs: string[];
beforeEach(() => {
  logs = [];
  for (const level of ["log", "info", "warn", "error", "debug", "trace"] as const) {
    vi.spyOn(console, level).mockImplementation((...args) => void logs.push(args.map(String).join(" ")));
  }
});
afterEach(() => vi.restoreAllMocks());

/** A confirmed event of an account with a session, handed over to `to`, whose link was sent: all there is to accept. */
async function aTransfer(db: Kysely<Database>, fields: { to?: string; linkAge?: number } = {}) {
  const { id, token } = await seedEvent(db, { title: "Tournoi de <Zorglub>" });
  const accountId = await confirmSeededEvent(db, id);
  const { email } = await db.selectFrom("account").select("email").where("id", "=", accountId).executeTakeFirstOrThrow();
  const session = await seedSession(db, accountId);
  const to = fields.to ?? anAddress();
  await seedTransfer(db, id, { email: to });
  const link = await seedLink(db, { kind: "transfer", eventId: id }, { createdAt: ago(fields.linkAge ?? MINUTE) });
  return { id, adminToken: token, accountId, email, session, to, link };
}

/** Everything the use cases may write, as one value, to prove that nothing was written. */
async function world(db: Kysely<Database>, id: string) {
  const count = async (table: "account" | "session" | "email_send" | "email_link") =>
    Number((await db.selectFrom(table).select((eb) => eb.fn.countAll().as("n")).executeTakeFirstOrThrow()).n);
  return {
    event: await db
      .selectFrom("event")
      .select(["account_id", "confirmed_at", "admin_token_hash", "transfer_email", "transfer_status", "transfer_status_at"])
      .where("id", "=", id)
      .executeTakeFirst(),
    links: await db.selectFrom("email_link").select(["token_hash", "kind", "used_at"]).where("event_id", "=", id).orderBy("token_hash").execute(),
    accounts: await count("account"),
    sessions: await count("session"),
    sends: await count("email_send"),
    links_all: await count("email_link"),
  };
}

const accountsOf = (db: Kysely<Database>, email: string) => db.selectFrom("account").select(["id", "locale"]).where("email", "=", email).execute();

/** A Brevo that remembers what it was given, and the `Handing` of a use case that talks to it. */
function handing(db: Kysely<Database>) {
  const sent: Email[] = [];
  const brevo: Brevo = { send: async (email) => (sent.push(email), { state: "sent" }) };
  const deps: Handing = { db, now: new Date(), locale: "fr", origin: "https://fullcar.test", brevo, later: () => {} };
  return { deps, sent };
}

describe("readTransferLink (OT3.1)", () => {
  it("gives the title and the start of the event for a link that serves, and writes nothing", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, link } = await aTransfer(trx);
      const before = await world(trx, id);
      expect(await readTransferLink(trx, link)).toEqual({ state: "valid", title: "Tournoi de <Zorglub>", allerAt: "2026-12-12 07:30:00" });
      expect(await readTransferLink(trx, link)).toMatchObject({ state: "valid" });
      expect(await world(trx, id)).toEqual(before);
      expect(logs).toEqual([]);
    });
  });

  it("OT2.6: made 6 days 23 hours ago it serves; 7 days and an hour ago it has expired, with no title and no date", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const recent = await aTransfer(trx, { linkAge: 7 * DAY - HOUR });
      expect(await readTransferLink(trx, recent.link)).toMatchObject({ state: "valid" });
      const old = await aTransfer(trx, { linkAge: 7 * DAY + HOUR });
      expect(await readTransferLink(trx, old.link)).toEqual({ state: "expired" });
    });
  });

  it("says `used` for a link that served, with no title and no date", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { link } = await aTransfer(trx);
      await openWithTransferLink(trx, link, "fr");
      expect(await readTransferLink(trx, link)).toEqual({ state: "used" });
    });
  });

  /** The ways a link opens nothing: each leaves the world as it is, and tells nothing of the event. */
  const INVALID: [string, (db: Kysely<Database>) => Promise<{ id: string; token: unknown }>][] = [
    ["an unknown token", async (db) => ({ ...(await aTransfer(db)), token: "AAAAAAAAAAAAAAAAAAAAAA" })],
    ["a value that is not a string", async (db) => ({ ...(await aTransfer(db)), token: 42 })],
    [
      "a token truncated by one character",
      async (db) => {
        const made = await aTransfer(db);
        return { ...made, token: made.link.slice(0, -1) };
      },
    ],
    [
      "a confirmation link of the event",
      async (db) => {
        const made = await aTransfer(db);
        return { ...made, token: await seedLink(db, { kind: "confirmation", eventId: made.id }) };
      },
    ],
    [
      "a link cancelled",
      async (db) => {
        const made = await aTransfer(db);
        await handOverEvent(made.id, { session: made.session }, { op: "cancel" }, handing(db).deps);
        return { ...made, token: made.link };
      },
    ],
    [
      "a link replaced by a change of address",
      async (db) => {
        const made = await aTransfer(db);
        await handOverEvent(made.id, { session: made.session }, { op: "change", email: anAddress() }, handing(db).deps);
        return { ...made, token: made.link };
      },
    ],
    [
      "an event anonymised",
      async (db) => {
        const made = await aTransfer(db);
        await db.updateTable("event").set({ transfer_email: null, transfer_status: null, transfer_status_at: null }).where("id", "=", made.id).execute();
        await anonymiseEvent(db, made.id);
        return { ...made, token: made.link };
      },
    ],
    [
      "an event deleted",
      async (db) => {
        const made = await aTransfer(db);
        await db.deleteFrom("event").where("id", "=", made.id).execute();
        return { ...made, token: made.link };
      },
    ],
    [
      "the account of the one who hands over, deleted",
      async (db) => {
        const made = await aTransfer(db);
        await eraseAccount(db, made.accountId, []);
        return { ...made, token: made.link };
      },
    ],
    [
      "a link whose event no longer waits on an address",
      async (db) => {
        const made = await aTransfer(db);
        await db.updateTable("event").set({ transfer_email: null, transfer_status: null, transfer_status_at: null }).where("id", "=", made.id).execute();
        return { ...made, token: made.link };
      },
    ],
  ];

  it.each(INVALID)("OT3.6: %s is `invalid`, with no title and no date, and nothing is written", async (_, make) => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, token } = await make(trx);
      const before = await world(trx, id);
      expect(await readTransferLink(trx, token)).toEqual({ state: "invalid" });
      expect(await openWithTransferLink(trx, token, "fr")).toEqual({ state: "invalid" });
      expect(await world(trx, id)).toEqual(before);
      expect(logs).toEqual([]);
    });
  });
});

describe("openWithTransferLink (OT3.2)", () => {
  it("hands the event to the account of the address, created in the page's language, and opens its session", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, accountId, to, link } = await aTransfer(trx);
      const other = await aTransfer(trx);
      const before = await world(trx, id);
      const answer = await openWithTransferLink(trx, link, "en");
      if (answer.state !== "opened") throw new Error("expected a session");
      expect(answer.eventId).toBe(id);

      const [account] = await accountsOf(trx, to);
      expect(account).toMatchObject({ locale: "en" });
      expect((await findSession(trx, answer.session))?.id).toBe(account!.id);

      const after = await world(trx, id);
      expect(after.event).toMatchObject({ account_id: account!.id, admin_token_hash: null, transfer_email: null, transfer_status: null, transfer_status_at: null });
      expect(after.event?.account_id).not.toBe(accountId);
      expect(after.event?.confirmed_at).toEqual(before.event?.confirmed_at);
      expect(before.event?.admin_token_hash).not.toBeNull();
      expect(after.accounts).toBe(before.accounts + 1);
      // The link is used and kept, so that it says « déjà servi »; no email went, none was counted.
      expect(after.links).toEqual([{ token_hash: expect.anything(), kind: "transfer", used_at: expect.any(Date) }]);
      expect(after.sends).toBe(before.sends);
      expect(logs).toEqual([]);
      // Another event's transfer is not this link's.
      expect((await world(trx, other.id)).event?.transfer_email).toBe(other.to);
    });
  });

  it("deletes the other transfer links of the event, but not another event's", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, link } = await aTransfer(trx);
      const second = await seedLink(trx, { kind: "transfer", eventId: id });
      const other = await aTransfer(trx);
      expect(await openWithTransferLink(trx, link, "fr")).toMatchObject({ state: "opened" });
      expect(await findLink(trx, second)).toBeNull();
      expect(await findLink(trx, link)).toMatchObject({ usedAt: expect.any(Date) });
      expect(await findLink(trx, other.link)).toMatchObject({ usedAt: null });
    });
  });

  it("is all or nothing: a failure on the last write leaves the account, the event and the links as they were", async () => {
    await withCommittedAddresses((_, address) =>
      withCommittedEvent(async (db, eventId) => {
        const to = address();
        const accountId = await seedAccount(db, { email: address() });
        await db.updateTable("event").set({ account_id: accountId, confirmed_at: new Date() }).where("id", "=", eventId).execute();
        await seedTransfer(db, eventId, { email: to });
        const link = await seedLink(db, { kind: "transfer", eventId });
        const before = await world(db, eventId);
        const failing: KyselyPlugin = {
          transformQuery: ({ node }) => {
            if (InsertQueryNode.is(node) && node.into?.table.identifier.name === "session") throw new Error("simulated failure");
            return node;
          },
          transformResult: async ({ result }) => result,
        };
        await expect(openWithTransferLink(db.withPlugin(failing), link, "fr")).rejects.toThrow("simulated failure");
        expect(await world(db, eventId)).toEqual(before);
        expect(await accountsOf(db, to)).toEqual([]);
      }),
    );
  });
});

describe("OT3.3 / OT3.4: the account that receives", () => {
  it("OT3.3: the new account hands the event over in turn", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, link } = await aTransfer(trx);
      const answer = await openWithTransferLink(trx, link, "fr");
      if (answer.state !== "opened") throw new Error("expected a session");
      const again = handing(trx);
      expect(await handOverEvent(id, { session: answer.session }, { op: "start", email: anAddress() }, again.deps)).toMatchObject({ ok: true });
    });
  });

  it("OT3.4: an account the address already had and one made by the link arrive at the same answer, with one account each", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const known = anAddress();
      const existing = await seedAccount(trx, { email: known, locale: "fr" });
      const a = await aTransfer(trx, { to: known });
      const b = await aTransfer(trx);
      const answerA = await openWithTransferLink(trx, a.link, "en");
      const answerB = await openWithTransferLink(trx, b.link, "en");
      expect(answerA).toEqual({ state: "opened", session: expect.any(String), eventId: a.id });
      expect(answerB).toEqual({ state: "opened", session: expect.any(String), eventId: b.id });
      expect(await accountsOf(trx, known)).toEqual([{ id: existing, locale: "fr" }]);
      expect(await accountsOf(trx, b.to)).toHaveLength(1);
      expect((await world(trx, a.id)).event?.account_id).toBe(existing);
    });
  });

  it("OT3.5: a session of another account stays open, and so do the one who hands over's", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { link, session } = await aTransfer(trx);
      const otherAccount = await seedAccount(trx);
      const otherSession = await seedSession(trx, otherAccount);
      const answer = await openWithTransferLink(trx, link, "fr");
      if (answer.state !== "opened") throw new Error("expected a session");
      expect(answer.session).not.toBe(otherSession);
      expect((await findSession(trx, otherSession))?.id).toBe(otherAccount);
      expect(await findSession(trx, session)).toBeDefined();
    });
  });
});

describe("OT3.6: the other states", () => {
  it("OT2.6: a link made 7 days and an hour ago has expired, and the event stays with the one who hands over; 6 days 23 hours ago it serves", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, link } = await aTransfer(trx, { linkAge: 7 * DAY + HOUR });
      const before = await world(trx, id);
      expect(await openWithTransferLink(trx, link, "fr")).toEqual({ state: "expired" });
      expect(await world(trx, id)).toEqual(before);
      const recent = await aTransfer(trx, { linkAge: 7 * DAY - HOUR });
      expect(await openWithTransferLink(trx, recent.link, "fr")).toMatchObject({ state: "opened" });
    });
  });

  it("a link used a second time says `used`, and opens no second session", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, link, to } = await aTransfer(trx);
      expect(await openWithTransferLink(trx, link, "fr")).toMatchObject({ state: "opened" });
      const before = await world(trx, id);
      expect(await openWithTransferLink(trx, link, "fr")).toEqual({ state: "used" });
      expect(await world(trx, id)).toEqual(before);
      const [account] = await accountsOf(trx, to);
      expect(await trx.selectFrom("session").select("token_hash").where("account_id", "=", account!.id).execute()).toHaveLength(1);
    });
  });

  it("a sign-in link is not valid here, and stays unused", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const accountId = await seedAccount(trx);
      const token = await seedLink(trx, { kind: "login", accountId, returnEventId: null });
      expect(await openWithTransferLink(trx, token, "fr")).toEqual({ state: "invalid" });
      expect(await findLink(trx, token)).toMatchObject({ usedAt: null });
    });
  });
});

describe("OT3.7: two requests at once", () => {
  it("two acceptances: one session and one account, the other finds the link used", async () => {
    await withCommittedAddresses((_, address) =>
      withCommittedEvent(async (db, eventId) => {
        const to = address();
        const accountId = await seedAccount(db, { email: address() });
        await db.updateTable("event").set({ account_id: accountId, confirmed_at: new Date() }).where("id", "=", eventId).execute();
        await seedTransfer(db, eventId, { email: to });
        const link = await seedLink(db, { kind: "transfer", eventId });
        const answers = await Promise.all([openWithTransferLink(db, link, "fr"), openWithTransferLink(db, link, "fr")]);
        expect(answers.map((answer) => answer.state).sort()).toEqual(["opened", "used"]);
        const accounts = await accountsOf(db, to);
        expect(accounts).toHaveLength(1);
        expect(await db.selectFrom("session").select("token_hash").where("account_id", "=", accounts[0]!.id).execute()).toHaveLength(1);
      }),
    );
  });

  /** An event committed, handed to `to`, with the session of its account and the link. */
  async function committedTransfer(db: Kysely<Database>, eventId: string, address: () => string) {
    const to = address();
    const accountId = await seedAccount(db, { email: address() });
    await db.updateTable("event").set({ account_id: accountId, confirmed_at: new Date() }).where("id", "=", eventId).execute();
    const session = await seedSession(db, accountId);
    await seedTransfer(db, eventId, { email: to });
    const link = await seedLink(db, { kind: "transfer", eventId });
    return { to, accountId, session, link };
  }

  it("a cancellation that holds the event first: the acceptance waits, then finds the link gone, and the event stays", async () => {
    await withCommittedAddresses((_, address) =>
      withCommittedEvent(async (db, eventId) => {
        const { session, link, accountId, to } = await committedTransfer(db, eventId, address);
        const answer = await whileHeld(
          db,
          async (trx) => {
            expect(await handOverEvent(eventId, { session }, { op: "cancel" }, handing(trx).deps)).toMatchObject({ ok: true });
          },
          (own) => openWithTransferLink(own, link, "fr"),
        );
        expect(answer).toEqual({ state: "invalid" });
        expect((await world(db, eventId)).event).toMatchObject({ account_id: accountId, transfer_email: null });
        expect(await accountsOf(db, to)).toEqual([]);
      }),
    );
  });

  it("an acceptance that holds the event first: the cancellation waits, then is refused, and the event is the recipient's", async () => {
    await withCommittedAddresses((_, address) =>
      withCommittedEvent(async (db, eventId) => {
        const { session, link, accountId, to } = await committedTransfer(db, eventId, address);
        const answer = await whileHeld(
          db,
          async (trx) => {
            expect(await openWithTransferLink(trx, link, "fr")).toMatchObject({ state: "opened" });
          },
          (own) => handOverEvent(eventId, { session }, { op: "cancel" }, handing(own).deps),
        );
        expect(answer).toEqual({ ok: false, error: "noOrganiserAccess" });
        const [recipient] = await accountsOf(db, to);
        expect((await world(db, eventId)).event).toMatchObject({ account_id: recipient!.id });
        expect((await world(db, eventId)).event?.account_id).not.toBe(accountId);
      }),
    );
  });

  it("an acceptance and a cancellation at once: exactly one of the two takes place", async () => {
    await withCommittedAddresses((_, address) =>
      withCommittedEvent(async (db, eventId) => {
        const { session, link, accountId } = await committedTransfer(db, eventId, address);
        const [accepted, cancelled] = await Promise.all([
          openWithTransferLink(db, link, "fr"),
          handOverEvent(eventId, { session }, { op: "cancel" }, handing(db).deps),
        ]);
        const owner = (await world(db, eventId)).event?.account_id;
        if (accepted.state === "opened") {
          expect(cancelled).toEqual({ ok: false, error: "noOrganiserAccess" });
          expect(owner).not.toBe(accountId);
        } else {
          expect(accepted).toEqual({ state: "invalid" });
          expect(cancelled).toMatchObject({ ok: true });
          expect(owner).toBe(accountId);
        }
      }),
    );
  });
});

/** The public answer of the event, for the participants. */
const publicOf = (db: Kysely<Database>, id: string) => readEventState(db, id);

describe("OT3.8 / OT4: after the acceptance", () => {
  it("OT3.8: the participants read the same answer before and after", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, link } = await aTransfer(trx);
      await seedPerson(trx, id, { firstName: "Léa", phone: PHONES[0] });
      const before = await publicOf(trx, id);
      expect(before).toBeDefined();
      await openWithTransferLink(trx, link, "fr");
      expect(await publicOf(trx, id)).toEqual(before);
    });
  });

  it("OT4.1: Mes événements, the panel and the screens of the one who handed over, and of the recipient", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, link, session, adminToken, email } = await aTransfer(trx);
      const answer = await openWithTransferLink(trx, link, "fr");
      if (answer.state !== "opened") throw new Error("expected a session");

      const mine = await readMyEvents(trx, session);
      if (mine.state !== "events") throw new Error("expected the list");
      expect(JSON.stringify(mine)).not.toContain(id);
      expect(await readOrganiserState(trx, id, { session })).toStrictEqual({ state: "notYours", email });
      expect(await readOrganiserState(trx, id, { adminToken })).toStrictEqual({ state: "signIn" });
      expect(await readOrganiserState(trx, id, { adminToken, session })).toStrictEqual({ state: "notYours", email });

      const theirs = await readMyEvents(trx, answer.session);
      expect(JSON.stringify(theirs)).toContain(id);
      expect(await readOrganiserState(trx, id, { session: answer.session })).toMatchObject({ state: "panel" });
    });
  });

  it("OT4.2: nothing answered to the one who handed over carries a phone number", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, link, session, adminToken } = await aTransfer(trx);
      // A drives, B waits for a car: B's number is in the panel the organiser reads.
      const driver = await seedPerson(trx, id, { firstName: "A", phone: PHONES[0] });
      const rider = await seedPerson(trx, id, { firstName: "B", phone: PHONES[1] });
      await seedRide(trx, id, driver.id, { leg: "aller", seats: 3 });
      await seedPlacement(trx, { personId: rider.id, eventId: id, leg: "aller", rideId: null });
      expect(JSON.stringify(await readOrganiserState(trx, id, { session })).replace(/\D/g, "")).toContain(digits(PHONES[1]));
      await openWithTransferLink(trx, link, "fr");
      const answers = [
        await readOrganiserState(trx, id, { session }),
        await readOrganiserState(trx, id, { adminToken }),
        await readOrganiserState(trx, id, { adminToken, session }),
        await readMyEvents(trx, session),
        await readEventState(trx, id),
      ];
      for (const answer of answers) {
        const written = JSON.stringify(answer).replace(/\D/g, "");
        for (const phone of PHONES) expect(written).not.toContain(digits(phone));
      }
    });
  });

  it("OT8.1: the rule is the one rule: before, the one who hands over is the organiser; after, only the recipient is, and never both", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const recipient = anAddress();
      const recipientId = await seedAccount(trx, { email: recipient });
      const recipientSession = await seedSession(trx, recipientId);
      const { id, link, session, adminToken } = await aTransfer(trx, { to: recipient });
      const states = async () => ({
        hands: (await readOrganiserState(trx, id, { session })).state,
        recipient: (await readOrganiserState(trx, id, { session: recipientSession })).state,
        creationBrowser: (await readOrganiserState(trx, id, { adminToken })).state,
        nobody: (await readOrganiserState(trx, id, {})).state,
      });
      expect(await states()).toEqual({ hands: "panel", recipient: "notYours", creationBrowser: "panel", nobody: "signIn" });
      expect(await openWithTransferLink(trx, link, "fr")).toMatchObject({ state: "opened" });
      expect(await states()).toEqual({ hands: "notYours", recipient: "panel", creationBrowser: "signIn", nobody: "signIn" });
    });
  });
});

describe("OT8.2: the journal", () => {
  it("holds no token and no address, whatever the link says", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const made = await aTransfer(trx);
      const old = await aTransfer(trx, { linkAge: 8 * DAY });
      await readTransferLink(trx, made.link);
      await openWithTransferLink(trx, old.link, "fr");
      await openWithTransferLink(trx, made.link, "fr");
      await openWithTransferLink(trx, made.link, "fr");
      await readTransferLink(trx, "AAAAAAAAAAAAAAAAAAAAAA");
      expect(logs).toEqual([]);
    });
  });
});
