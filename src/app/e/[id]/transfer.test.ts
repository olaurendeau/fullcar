import { sql, UpdateQueryNode, type Kysely, type KyselyPlugin } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { anonymiseEvent } from "@/db/day-thirty";
import { findLink, useLink } from "@/db/email-links";
import { lockEvent } from "@/db/events";
import type { Database } from "@/db/schema";
import { closeSession } from "@/db/sessions";
import { anAddress, seedAccount, seedLink, seedSends, seedSession, withCommittedAddresses, withRollbackRecordingSends } from "@/db/test-accounts";
import { whileHeld, withCommittedEvent } from "@/db/test-committed";
import { confirmSeededEvent, seedEvent, seedPendingSend } from "@/db/test-events";
import { seedPerson } from "@/db/test-participants";
import { GLOBAL_SENDS_PER_HOUR, TRANSFERS_PER_EVENT } from "@/domain/send-limits";
import { createBrevo, type Brevo, type Email, type SendAnswer } from "@/email/brevo";
import { editEvent } from "./edit-event";
import { readOrganiserState } from "./organiser-state";
import { handOverEvent, type Handing } from "./transfer";

/*
 * Epic #935, T6 (#944) and T7 (#945): « Céder l'événement », « Changer l'adresse », « Renvoyer
 * l'e-mail » and « Annuler la cession », OT1 to OT6. The events
 * are confirmed by an account of their own, whose session (or the creation browser's token)
 * is the proof. `later` is `after()`: its tasks run when `run()` says so.
 */

const ORIGIN = "https://fullcar.test";

let logs: unknown[][];
beforeEach(() => {
  logs = [];
  for (const level of ["log", "info", "warn", "error", "debug", "trace"] as const) {
    vi.spyOn(console, level).mockImplementation((...args) => void logs.push(args));
  }
});
afterEach(() => vi.restoreAllMocks());

function handing(db: Kysely<Database>, answer: () => Promise<SendAnswer> = async () => ({ state: "sent" }), now = new Date()) {
  const sent: Email[] = [];
  const tasks: (() => Promise<void>)[] = [];
  const brevo: Brevo = { send: (email) => (sent.push(email), answer()) };
  const deps: Handing = { db, now, locale: "fr", origin: ORIGIN, brevo, later: (task) => void tasks.push(task) };
  const run = async () => {
    for (const task of tasks.splice(0)) await task();
  };
  return { deps, sent, run, queued: () => tasks.length };
}

/** The token of the transfer link in the email, after `#`. */
function tokenIn(email: Email): string {
  const match = new RegExp(`${ORIGIN}/connexion/cession#([A-Za-z0-9_-]{22})(?![A-Za-z0-9_-])`).exec(email.text);
  if (!match) throw new Error("expected a transfer link in the email");
  return match[1]!;
}

/** A confirmed event of an account with a session; its creation browser still holds `token`. */
async function anEvent(db: Kysely<Database>, fields: Parameters<typeof seedEvent>[1] = {}) {
  const { id, token } = await seedEvent(db, fields);
  const accountId = await confirmSeededEvent(db, id);
  const { email } = await db.selectFrom("account").select("email").where("id", "=", accountId).executeTakeFirstOrThrow();
  const session = await seedSession(db, accountId);
  return { id, token, accountId, email, session, proof: { session } };
}

const eventRow = (db: Kysely<Database>, id: string) =>
  db
    .selectFrom("event")
    .select(["account_id", "admin_token_hash", "transfer_email", "transfer_status", "transfer_status_at"])
    .where("id", "=", id)
    .executeTakeFirstOrThrow();
const linksOf = (db: Kysely<Database>, id: string) =>
  db.selectFrom("email_link").select(["kind", "used_at"]).where("event_id", "=", id).execute();
const sendsOf = (db: Kysely<Database>, id: string) => db.selectFrom("email_send").select(["kind", "email"]).where("event_id", "=", id).execute();
const accountCount = async (db: Kysely<Database>) =>
  Number((await db.selectFrom("account").select((eb) => eb.fn.countAll().as("n")).executeTakeFirstOrThrow()).n);

/** Everything the use case may write, as one value, to prove that nothing was written. */
async function snapshot(db: Kysely<Database>, id: string) {
  return { event: await eventRow(db, id), links: await linksOf(db, id), sends: await sendsOf(db, id), accounts: await accountCount(db) };
}

describe("OT1.3 / OT1.4: what is typed", () => {
  it.each([
    ["", "required"],
    ["   ", "required"],
    [undefined, "required"],
    ["camille", "email"],
    ["a@b", "email"],
    [`${"x".repeat(250)}@exemple.fr`, "email"],
    [42, "email"],
  ])("answers %j with %s, and nothing is written nor sent", async (typed, error) => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await anEvent(trx);
      const before = await snapshot(trx, id);
      const { deps, sent, queued } = handing(trx);
      for (const op of ["start", "change"]) {
        expect(await handOverEvent(id, proof, { op, email: typed }, deps)).toEqual({ ok: false, error });
      }
      expect(await snapshot(trx, id)).toEqual(before);
      expect(sent).toEqual([]);
      expect(queued()).toBe(0);
    });
  });

  it("reads the field before anything else: a bad address to an unknown event or without access is the field's error", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id } = await anEvent(trx);
      const { deps } = handing(trx);
      expect(await handOverEvent(id, {}, { op: "start", email: "" }, deps)).toEqual({ ok: false, error: "required" });
      expect(await handOverEvent("zzzzzzzz", {}, { op: "start", email: "x" }, deps)).toEqual({ ok: false, error: "email" });
    });
  });

  it("OT1.4: the account's own address, in capitals and with spaces, is `self`, and nothing is written nor sent", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof, email } = await anEvent(trx);
      const before = await snapshot(trx, id);
      const { deps, sent } = handing(trx);
      expect(await handOverEvent(id, proof, { op: "start", email: `  ${email.toUpperCase()} ` }, deps)).toEqual({ ok: false, error: "self" });
      expect(await snapshot(trx, id)).toEqual(before);
      expect(sent).toEqual([]);
    });
  });

  it.each([null, undefined, "start", [], {}, { op: "dance", email: "a@exemple.fr" }, { op: "Resend" }, { op: "cancel " }, { email: "a@exemple.fr" }])(
    "answers `invalid` to the request %j, and nothing is written",
    async (request) => {
      await withRollbackRecordingSends(async (trx) => {
        const { id, proof } = await anEvent(trx);
        const before = await snapshot(trx, id);
        expect(await handOverEvent(id, proof, request, handing(trx).deps)).toEqual({ ok: false, error: "invalid" });
        expect(await snapshot(trx, id)).toEqual(before);
      });
    },
  );
});

describe("OT1.5: a transfer starts", () => {
  it("keeps the address with the event, exactly one unused link, the account and the admin token; the email goes after the answer", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof, accountId } = await anEvent(trx);
      const before = await eventRow(trx, id);
      const to = anAddress();
      const { deps, sent, run, queued } = handing(trx);
      expect(await handOverEvent(id, proof, { op: "start", email: ` ${to.toUpperCase()}` }, deps)).toEqual({
        ok: true,
        transfer: { email: to, send: "sending" },
      });
      expect(sent).toEqual([]);
      expect(queued()).toBe(1);
      expect(await eventRow(trx, id)).toMatchObject({
        account_id: accountId,
        admin_token_hash: before.admin_token_hash,
        transfer_email: to,
        transfer_status: "sending",
      });
      expect(await linksOf(trx, id)).toEqual([{ kind: "transfer", used_at: null }]);
      expect(await sendsOf(trx, id)).toEqual([{ kind: "transfer", email: to }]);

      await run();
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ to });
      expect((await eventRow(trx, id)).transfer_status).toBe("sent");
    });
  });

  it("starts from the creation browser's token as from the session", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, token } = await anEvent(trx);
      const to = anAddress();
      expect(await handOverEvent(id, { adminToken: token }, { op: "start", email: to }, handing(trx).deps)).toMatchObject({ ok: true });
      expect((await eventRow(trx, id)).transfer_email).toBe(to);
    });
  });

  it("leaves the panel and the phone numbers readable by the one who hands over, with the notice", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await anEvent(trx);
      await seedPerson(trx, id, { firstName: "Léa", phone: "06 11 22 33 44" });
      const to = anAddress();
      await handOverEvent(id, proof, { op: "start", email: to }, handing(trx).deps);
      const answer = await readTransferState(trx, id, proof);
      expect(answer).toMatchObject({ state: "panel", transfer: { email: to, send: "sending" } });
      expect(JSON.stringify(answer)).toContain("Léa");
    });
  });

  it("shows the notice, and the address, to no one but the organiser", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await anEvent(trx);
      const to = anAddress();
      await handOverEvent(id, proof, { op: "start", email: to }, handing(trx).deps);
      const stranger = await seedSession(trx, await seedAccount(trx));
      for (const visitor of [{}, { session: stranger }, { adminToken: "x".repeat(22) }]) {
        const answer = await readTransferState(trx, id, visitor);
        expect(answer).not.toMatchObject({ state: "panel" });
        expect(JSON.stringify(answer)).not.toContain(to);
      }
    });
  });

  it("OT5.2: an event that is over but not anonymised can be handed over", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await anEvent(trx, { allerAt: "2020-01-01 08:00:00", retourAt: null });
      expect(await handOverEvent(id, proof, { op: "start", email: anAddress() }, handing(trx).deps)).toMatchObject({ ok: true });
    });
  });
});

/** The panel's read, in the transaction of the test (REPEATABLE READ, as withRollback opens it). */
const readTransferState = (trx: Kysely<Database>, id: string, proof: unknown, now = new Date()) => readOrganiserState(trx, id, proof, now);

describe("OT1.6: the email fails or the limit stops it", () => {
  it("a failed send is `failed`, the transfer exists and can be changed or resent", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await anEvent(trx);
      const to = anAddress();
      const { deps, run } = handing(trx, async () => ({ state: "failed" }));
      await handOverEvent(id, proof, { op: "start", email: to }, deps);
      await run();
      expect(await eventRow(trx, id)).toMatchObject({ transfer_email: to, transfer_status: "failed" });
      expect(await linksOf(trx, id)).toHaveLength(1);
    });
  });

  it("OT6.4: a provider that does not answer is a failure at 10 s", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await anEvent(trx);
      const controller = new AbortController();
      vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
      const mute = createBrevo({
        fetch: (_url, init) =>
          new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("timeout", "TimeoutError")))),
        url: "https://brevo.test/v3/smtp/email",
        key: "key",
        from: { email: "bonjour@fullcar.test" },
      });
      const { deps, run } = handing(trx);
      const mutely = { ...deps, brevo: mute };
      const to = anAddress();
      await handOverEvent(id, proof, { op: "start", email: to }, mutely);
      const running = run();
      controller.abort(new DOMException("timeout", "TimeoutError"));
      await running;
      expect((await eventRow(trx, id)).transfer_status).toBe("failed");
    });
  });

  it("a `sending` of more than 30 s is read as a failure", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await anEvent(trx);
      const now = new Date();
      await handOverEvent(id, proof, { op: "start", email: anAddress() }, handing(trx, undefined, now).deps);
      const fresh = await readTransferState(trx, id, proof, new Date(now.getTime() + 29_000));
      expect(fresh).toMatchObject({ transfer: { send: "sending" } });
      const stale = await readTransferState(trx, id, proof, new Date(now.getTime() + 31_000));
      expect(stale).toMatchObject({ transfer: { send: "failed" } });
    });
  });

  it("the limit of the address writes the transfer as `address_limit`: no link, no email, the old links gone", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await anEvent(trx);
      const old = await seedLink(trx, { kind: "transfer", eventId: id });
      const to = anAddress();
      await seedSends(trx, 5, { kind: "confirmation", email: to });
      const { deps, sent, queued } = handing(trx);
      expect(await handOverEvent(id, proof, { op: "start", email: to }, deps)).toEqual({ ok: true, transfer: { email: to, send: "addressLimit" } });
      expect(await eventRow(trx, id)).toMatchObject({ transfer_email: to, transfer_status: "address_limit" });
      expect(await linksOf(trx, id)).toEqual([]);
      expect(await findLink(trx, old)).toBeNull();
      expect(sent).toEqual([]);
      expect(queued()).toBe(0);
      expect(await readTransferState(trx, id, proof)).toMatchObject({ transfer: { email: to, send: "addressLimit" } });
    });
  });

  it("the global cap writes the transfer as `address_limit` too: no link, no email, the old links gone", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await anEvent(trx);
      const old = await seedLink(trx, { kind: "transfer", eventId: id });
      await seedSends(trx, GLOBAL_SENDS_PER_HOUR, { kind: "login", email: () => anAddress() });
      const to = anAddress();
      const { deps, sent, queued } = handing(trx);
      expect(await handOverEvent(id, proof, { op: "start", email: to }, deps)).toEqual({ ok: true, transfer: { email: to, send: "addressLimit" } });
      expect(await eventRow(trx, id)).toMatchObject({ transfer_email: to, transfer_status: "address_limit" });
      expect(await linksOf(trx, id)).toEqual([]);
      expect(await findLink(trx, old)).toBeNull();
      expect(sent).toEqual([]);
      expect(queued()).toBe(0);
    });
  });

  it.each(["start", "change"] as const)("`%s` to the address already waiting, stopped by its limit, keeps the link that still works", async (op) => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await anEvent(trx);
      const to = anAddress();
      const first = handing(trx);
      await handOverEvent(id, proof, { op: "start", email: to }, first.deps);
      await first.run();
      const token = tokenIn(first.sent[0]!);
      await seedSends(trx, 5, { kind: "confirmation", email: to });

      const second = handing(trx);
      expect(await handOverEvent(id, proof, { op, email: to }, second.deps)).toEqual({ ok: true, transfer: { email: to, send: "addressLimit" } });
      expect(await eventRow(trx, id)).toMatchObject({ transfer_email: to, transfer_status: "address_limit" });
      expect(second.sent).toEqual([]);
      expect(await linksOf(trx, id)).toEqual([{ kind: "transfer", used_at: null }]);
      expect(await useLink(trx, token, "transfer")).toMatchObject({ outcome: "valid", link: { eventId: id } });
    });
  });

  it("`change` to another address, stopped by its limit, deletes the links of the address it replaces", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await anEvent(trx);
      const first = handing(trx);
      await handOverEvent(id, proof, { op: "start", email: anAddress() }, first.deps);
      await first.run();
      const oldToken = tokenIn(first.sent[0]!);
      const to = anAddress();
      await seedSends(trx, 5, { kind: "confirmation", email: to });

      expect(await handOverEvent(id, proof, { op: "change", email: to }, handing(trx).deps)).toEqual({ ok: true, transfer: { email: to, send: "addressLimit" } });
      expect(await linksOf(trx, id)).toEqual([]);
      expect(await useLink(trx, oldToken, "transfer")).toEqual({ outcome: "invalid" });
    });
  });

  it("OT6.5: the fourth request of an hour for an event is `tooMany`, and writes nothing", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await anEvent(trx);
      for (let n = 0; n < TRANSFERS_PER_EVENT; n++) {
        expect(await handOverEvent(id, proof, { op: "start", email: anAddress() }, handing(trx).deps)).toMatchObject({ ok: true });
      }
      const before = await snapshot(trx, id);
      const { deps, sent, queued } = handing(trx);
      expect(await handOverEvent(id, proof, { op: "start", email: anAddress() }, deps)).toEqual({ ok: false, error: "tooMany" });
      expect(await snapshot(trx, id)).toEqual(before);
      expect(sent).toEqual([]);
      expect(queued()).toBe(0);
    });
  });
});

describe("OT1.7 / OT1.8 / OT8.6: the address has an account or not", () => {
  it("creates no account, and answers and writes the same for an address that has one", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await anEvent(trx);
      const other = await anEvent(trx);
      const known = anAddress();
      await seedAccount(trx, { email: known });
      const unknown = anAddress();
      const accounts = await accountCount(trx);

      const withAccount = handing(trx);
      const first = await handOverEvent(id, proof, { op: "start", email: known }, withAccount.deps);
      await withAccount.run();
      const withoutAccount = handing(trx);
      const second = await handOverEvent(other.id, other.proof, { op: "start", email: unknown }, withoutAccount.deps);
      await withoutAccount.run();

      expect(await accountCount(trx)).toBe(accounts);
      expect(first).toEqual({ ok: true, transfer: { email: known, send: "sending" } });
      expect(second).toEqual({ ok: true, transfer: { email: unknown, send: "sending" } });
      const normal = (email: Email) => ({ subject: email.subject, text: email.text.replace(/#[A-Za-z0-9_-]{22}/, "#TOKEN"), html: email.html.replace(/#[A-Za-z0-9_-]{22}/g, "#TOKEN") });
      expect(normal(withAccount.sent[0]!)).toEqual(normal(withoutAccount.sent[0]!));
    });
  });
});

describe("OT2.1: the one who hands over keeps the event", () => {
  it("changes the event while the transfer waits", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await anEvent(trx);
      await handOverEvent(id, proof, { op: "start", email: anAddress() }, handing(trx).deps);
      const before = { title: "Tournoi de Rennes", location: "Gymnase des Gayeulles", allerAt: "2026-12-12 07:30:00", retourAt: "2026-12-12 18:00:00", locationPosition: null, description: null };
      const form = { title: "Tournoi de Nantes", location: before.location, allerDate: "2026-12-12", allerTime: "07:30", retour: true, retourDate: "2026-12-12", retourTime: "18:00" };
      expect(await editEvent(trx, id, proof, form, before)).toMatchObject({ ok: true });
    });
  });
});

describe("OT2.4 / OT2.7: a change, or a second start, replaces the first", () => {
  it.each(["change", "start"] as const)("`%s` deletes the links sent to the old address and its link answers `invalid`", async (op) => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await anEvent(trx);
      const first = handing(trx);
      const oldAddress = anAddress();
      await handOverEvent(id, proof, { op: "start", email: oldAddress }, first.deps);
      await first.run();
      const oldToken = tokenIn(first.sent[0]!);

      const second = handing(trx);
      const newAddress = anAddress();
      expect(await handOverEvent(id, proof, { op, email: newAddress }, second.deps)).toEqual({ ok: true, transfer: { email: newAddress, send: "sending" } });
      await second.run();

      expect(await useLink(trx, oldToken, "transfer")).toEqual({ outcome: "invalid" });
      expect(await linksOf(trx, id)).toEqual([{ kind: "transfer", used_at: null }]);
      expect(await useLink(trx, tokenIn(second.sent[0]!), "transfer")).toMatchObject({ outcome: "valid", link: { eventId: id } });
      expect(JSON.stringify(await eventRow(trx, id))).not.toContain(oldAddress);
      expect(JSON.stringify(await linksOf(trx, id))).not.toContain(oldAddress);
    });
  });

  it("an email still on its way for the old address writes no result over the new one", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await anEvent(trx);
      const first = handing(trx, async () => ({ state: "failed" }), new Date(Date.now() - 1000));
      await handOverEvent(id, proof, { op: "start", email: anAddress() }, first.deps);
      const second = handing(trx);
      await handOverEvent(id, proof, { op: "change", email: anAddress() }, second.deps);
      await first.run();
      expect((await eventRow(trx, id)).transfer_status).toBe("sending");
    });
  });

  it("`change` without a transfer is `gone`, and writes nothing", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await anEvent(trx);
      const before = await snapshot(trx, id);
      expect(await handOverEvent(id, proof, { op: "change", email: anAddress() }, handing(trx).deps)).toEqual({ ok: false, error: "gone" });
      expect(await snapshot(trx, id)).toEqual(before);
    });
  });
});

describe("OT5: what cannot be handed over", () => {
  it("OT5.1: a pending event is `pending`, from the creation browser too, and nothing is written", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, token } = await seedEvent(trx);
      await seedPendingSend(trx, id, { email: anAddress(), status: "sent" });
      const before = await snapshot(trx, id);
      const { deps, sent } = handing(trx);
      expect(await handOverEvent(id, { adminToken: token }, { op: "start", email: anAddress() }, deps)).toEqual({ ok: false, error: "pending" });
      expect(await snapshot(trx, id)).toEqual(before);
      expect(sent).toEqual([]);
    });
  });

  it("OT5.2: an anonymised event is `eventEnded`", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await anEvent(trx, { allerAt: "2020-01-01 08:00:00", retourAt: null });
      await anonymiseEvent(trx, id);
      const before = await snapshot(trx, id);
      expect(await handOverEvent(id, proof, { op: "start", email: anAddress() }, handing(trx).deps)).toEqual({ ok: false, error: "eventEnded" });
      expect(await snapshot(trx, id)).toEqual(before);
    });
  });

  it("OT5.3: an event without an organiser is `noOrganiserAccess`, the token left behind too", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, token, accountId } = await anEvent(trx);
      await trx.updateTable("event").set({ account_id: null }).where("id", "=", id).execute();
      void accountId;
      expect(await handOverEvent(id, { adminToken: token }, { op: "start", email: anAddress() }, handing(trx).deps)).toEqual({ ok: false, error: "noOrganiserAccess" });
    });
  });

  it("an unknown or malformed event is `eventNotFound`", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { deps } = handing(trx);
      for (const id of ["zzzzzzzz", "../x", 42, undefined]) {
        expect(await handOverEvent(id, {}, { op: "start", email: anAddress() }, deps)).toEqual({ ok: false, error: "eventNotFound" });
      }
    });
  });

  it("OT5.4: nobody, a wrong token and another account's session are `noOrganiserAccess`: nothing is written, nothing is sent", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id } = await anEvent(trx);
      const stranger = await seedSession(trx, await seedAccount(trx));
      const before = await snapshot(trx, id);
      const { deps, sent, queued } = handing(trx);
      for (const proof of [{}, undefined, null, { adminToken: "x".repeat(22) }, { session: stranger }, { session: "nope" }]) {
        expect(await handOverEvent(id, proof, { op: "start", email: anAddress() }, deps)).toEqual({ ok: false, error: "noOrganiserAccess" });
      }
      expect(await snapshot(trx, id)).toEqual(before);
      expect(sent).toEqual([]);
      expect(queued()).toBe(0);
    });
  });
});

describe("OT2.9 / OT4.3: the session after the request", () => {
  it("a session closed afterwards leaves the transfer", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof, session } = await anEvent(trx);
      await handOverEvent(id, proof, { op: "start", email: anAddress() }, handing(trx).deps);
      await closeSession(trx, session);
      expect((await eventRow(trx, id)).transfer_email).not.toBeNull();
    });
  });

  it.each([
    ["a session closed", "session"],
    ["an admin token revoked", "adminToken"],
  ] as const)("OT4.3: %s while the request waits for the lock is `noOrganiserAccess`, and nothing is written", async (_, by) => {
    await withCommittedAddresses((_, address) =>
      withCommittedEvent(async (db, eventId, token) => {
        const accountId = await seedAccount(db, { email: address() });
        await db.updateTable("event").set({ account_id: accountId, confirmed_at: new Date() }).where("id", "=", eventId).execute();
        const session = await seedSession(db, accountId);
        // The creation browser proves with its token alone, the account with its session alone.
        const proof = by === "session" ? { session } : { adminToken: token };
        const { deps, sent } = handing(db);
        const answer = await whileHeld(
          db,
          async (trx) => {
            await lockEvent(trx, eventId, "noKeyUpdate");
            // The token is on the Event's row, which the holder's lock keeps: it revokes it itself.
            if (by === "adminToken") await trx.updateTable("event").set({ admin_token_hash: null }).where("id", "=", eventId).execute();
          },
          (own) => handOverEvent(eventId, proof, { op: "start", email: address() }, { ...deps, db: own }),
          async () => {
            if (by === "session") await closeSession(db, session);
          },
        );
        expect(answer).toEqual({ ok: false, error: "noOrganiserAccess" });
        expect((await eventRow(db, eventId)).transfer_email).toBeNull();
        expect(await linksOf(db, eventId)).toEqual([]);
        expect(sent).toEqual([]);
      }),
    );
  });
});

describe("OT6.2: the email carries nothing typed", () => {
  it("neither the title, nor the place, nor the address of the one who hands over", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof, accountId } = await anEvent(trx, { title: "Zorglub <b>x</b>", location: "Zorglub-lieu" });
      await trx.updateTable("account").set({ email: "cedant@exemple.fr" }).where("id", "=", accountId).execute();
      const { deps, sent, run } = handing(trx);
      await handOverEvent(id, proof, { op: "start", email: anAddress() }, deps);
      await run();
      for (const part of [sent[0]!.subject, sent[0]!.text, sent[0]!.html]) {
        expect(part).not.toContain("Zorglub");
        expect(part).not.toContain("cedant@exemple.fr");
      }
    });
  });
});

describe("OT8.2: the journal", () => {
  it("holds no token and no address, whatever happens", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof, token, session } = await anEvent(trx);
      const to = anAddress();
      const { deps, sent, run } = handing(trx, async () => ({ state: "failed" }));
      await handOverEvent(id, proof, { op: "start", email: to }, deps);
      await run();
      const link = tokenIn(sent[0]!);
      await handOverEvent(id, { adminToken: token }, { op: "start", email: "mauvaise" }, deps);
      await handOverEvent(id, { adminToken: token }, { op: "change", email: to }, handing(trx).deps);
      const written = JSON.stringify(logs);
      for (const secret of [to, link, token, session]) expect(written).not.toContain(secret);
    });
  });

  // The test above reads an empty journal when nothing is written to it. These two make the
  // journal write (Brevo throws, then the database fails) and read that it did, so that the
  // absence of a secret in it proves something (follow-up of the review of #1010).
  it("holds no token and no address when Brevo throws an error that carries them", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof, token } = await anEvent(trx);
      const to = anAddress();
      let link = "";
      const { deps, run } = handing(trx);
      deps.brevo = {
        send: async (email) => {
          link = tokenIn(email);
          throw new Error(`Brevo refused ${to} with the link ${link} and the token ${token}`);
        },
      };
      await handOverEvent(id, proof, { op: "start", email: to }, deps);
      await run();
      await handOverEvent(id, proof, { op: "resend" }, deps);
      expect(logs.length).toBeGreaterThan(0);
      const written = JSON.stringify(logs);
      expect(link).not.toBe("");
      for (const secret of [to, link, token]) expect(written).not.toContain(secret);
    });
  });

  it("holds no token and no address when the database fails with an error that carries them", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof, token } = await anEvent(trx);
      const to = anAddress();
      let broken = false;
      const failing: KyselyPlugin = {
        transformQuery: ({ node }) => {
          if (broken && UpdateQueryNode.is(node)) {
            throw Object.assign(new Error(`Failing row contains (${to}, ${token})`), { code: "57P01" });
          }
          return node;
        },
        transformResult: async ({ result }) => result,
      };
      const { deps, sent, run } = handing(trx);
      const afterwards = { ...deps, db: trx.withPlugin(failing) };
      await handOverEvent(id, proof, { op: "start", email: to }, afterwards);
      // The result of the email is the write that fails, once Brevo has answered.
      broken = true;
      await run();
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.some((line) => JSON.stringify(line).includes("SQLSTATE 57P01"))).toBe(true);
      const written = JSON.stringify(logs);
      for (const secret of [to, tokenIn(sent[0]!), token]) expect(written).not.toContain(secret);
    });
  });

  it("resend and cancel hold no token and no address either, whatever Brevo answers", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof, token, session } = await anEvent(trx);
      const { to, token: link } = await aTransferThatWaits(trx, id, proof);
      await handOverEvent(id, proof, { op: "resend" }, handing(trx, async () => ({ state: "failed" })).deps);
      await handOverEvent(id, { adminToken: token }, { op: "cancel" }, handing(trx).deps);
      await handOverEvent(id, { adminToken: token }, { op: "resend" }, handing(trx).deps);
      const written = JSON.stringify(logs);
      for (const secret of [to, link, token, session]) expect(written).not.toContain(secret);
    });
  });
});

/** A transfer that waits, started and sent, as the organiser left it: its address and the token of its link. */
async function aTransferThatWaits(trx: Kysely<Database>, id: string, proof: unknown) {
  const first = handing(trx);
  const to = anAddress();
  await handOverEvent(id, proof, { op: "start", email: to }, first.deps);
  await first.run();
  return { to, token: tokenIn(first.sent[0]!) };
}

describe("OT2.3 / OT2.6: « Renvoyer l'e-mail »", () => {
  it("OT2.3: one more link to the same address, the earlier one still valid, and the answer waits for Brevo", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await anEvent(trx);
      const { to, token } = await aTransferThatWaits(trx, id, proof);

      const again = handing(trx);
      expect(await handOverEvent(id, proof, { op: "resend" }, again.deps)).toEqual({ ok: true, transfer: { email: to, send: "sent" } });
      expect(again.queued()).toBe(0);
      expect(again.sent).toHaveLength(1);
      expect(again.sent[0]!.to).toBe(to);
      expect(await eventRow(trx, id)).toMatchObject({ transfer_email: to, transfer_status: "sent" });
      expect(await linksOf(trx, id)).toEqual([
        { kind: "transfer", used_at: null },
        { kind: "transfer", used_at: null },
      ]);
      expect(await sendsOf(trx, id)).toHaveLength(2);
      expect(await useLink(trx, token, "transfer")).toMatchObject({ outcome: "valid", link: { eventId: id } });
      expect(await useLink(trx, tokenIn(again.sent[0]!), "transfer")).toMatchObject({ outcome: "valid", link: { eventId: id } });
    });
  });

  it("answers `failed` when Brevo fails, and keeps the transfer, its address and its links", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await anEvent(trx);
      const { to } = await aTransferThatWaits(trx, id, proof);
      const answer = await handOverEvent(id, proof, { op: "resend" }, handing(trx, async () => ({ state: "failed" })).deps);
      expect(answer).toEqual({ ok: true, transfer: { email: to, send: "failed" } });
      expect(await eventRow(trx, id)).toMatchObject({ transfer_email: to, transfer_status: "failed" });
      expect(await linksOf(trx, id)).toHaveLength(2);
    });
  });

  it("reads nothing that comes with the request: it goes to the address that waits", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await anEvent(trx);
      const { to } = await aTransferThatWaits(trx, id, proof);
      const again = handing(trx);
      expect(await handOverEvent(id, proof, { op: "resend", email: "mauvaise" }, again.deps)).toEqual({ ok: true, transfer: { email: to, send: "sent" } });
      expect(again.sent[0]!.to).toBe(to);
    });
  });

  it("OT2.6: after the link expired, it sends a new link, and the notice is no longer `expired`", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await anEvent(trx);
      const { to, token } = await aTransferThatWaits(trx, id, proof);
      await sql`update email_link set created_at = now() - interval '8 days' where event_id = ${id}`.execute(trx);
      expect(await readTransferState(trx, id, proof)).toMatchObject({ transfer: { email: to, send: "expired" } });
      expect(await useLink(trx, token, "transfer", new Date())).toEqual({ outcome: "expired" });

      const again = handing(trx);
      expect(await handOverEvent(id, proof, { op: "resend" }, again.deps)).toEqual({ ok: true, transfer: { email: to, send: "sent" } });
      expect(await readTransferState(trx, id, proof)).toMatchObject({ transfer: { email: to, send: "sent" } });
      expect(await useLink(trx, tokenIn(again.sent[0]!), "transfer")).toMatchObject({ outcome: "valid", link: { eventId: id } });
    });
  });

  it("OT6.5: a resend counts in the event's limit of the hour: the fourth request is `tooMany`, and writes nothing", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await anEvent(trx);
      await aTransferThatWaits(trx, id, proof);
      for (let n = 1; n < TRANSFERS_PER_EVENT; n++) {
        expect(await handOverEvent(id, proof, { op: "resend" }, handing(trx).deps)).toMatchObject({ ok: true });
      }
      const before = await snapshot(trx, id);
      const { deps, sent } = handing(trx);
      expect(await handOverEvent(id, proof, { op: "resend" }, deps)).toEqual({ ok: false, error: "tooMany" });
      expect(await snapshot(trx, id)).toEqual(before);
      expect(sent).toEqual([]);
    });
  });

  it.each([
    ["the limit of the address", async (trx: Kysely<Database>, to: string) => seedSends(trx, 5, { kind: "confirmation", email: to })],
    ["the global cap", async (trx: Kysely<Database>) => seedSends(trx, GLOBAL_SENDS_PER_HOUR, { kind: "login", email: () => anAddress() })],
  ])("%s answers `tooMany`, and writes nothing, the transfer and its links as they were", async (_, limit) => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await anEvent(trx);
      const { to, token } = await aTransferThatWaits(trx, id, proof);
      await limit(trx, to);
      const before = await snapshot(trx, id);
      const { deps, sent } = handing(trx);
      expect(await handOverEvent(id, proof, { op: "resend" }, deps)).toEqual({ ok: false, error: "tooMany" });
      expect(await snapshot(trx, id)).toEqual(before);
      expect(sent).toEqual([]);
      expect(await useLink(trx, token, "transfer")).toMatchObject({ outcome: "valid" });
    });
  });
});

describe("OT2.5: « Annuler la cession »", () => {
  it("deletes every transfer link, clears the address, and answers the address cancelled", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof, accountId } = await anEvent(trx);
      const { to, token } = await aTransferThatWaits(trx, id, proof);
      await handOverEvent(id, proof, { op: "resend" }, handing(trx).deps);
      expect(await linksOf(trx, id)).toHaveLength(2);

      const { deps, sent, queued } = handing(trx);
      expect(await handOverEvent(id, proof, { op: "cancel" }, deps)).toEqual({ ok: true, cancelled: to });
      expect(await linksOf(trx, id)).toEqual([]);
      expect(await eventRow(trx, id)).toMatchObject({
        account_id: accountId,
        transfer_email: null,
        transfer_status: null,
        transfer_status_at: null,
      });
      expect(await useLink(trx, token, "transfer")).toEqual({ outcome: "invalid" });
      expect(sent).toEqual([]);
      expect(queued()).toBe(0);
      expect(await readTransferState(trx, id, proof)).not.toHaveProperty("transfer");
    });
  });

  it("an email still on its way writes nothing once the transfer is cancelled", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await anEvent(trx);
      const sending = handing(trx, async () => ({ state: "sent" }), new Date(Date.now() - 1000));
      await handOverEvent(id, proof, { op: "start", email: anAddress() }, sending.deps);
      await handOverEvent(id, proof, { op: "cancel" }, handing(trx).deps);
      await sending.run();
      expect(await eventRow(trx, id)).toMatchObject({ transfer_email: null, transfer_status: null, transfer_status_at: null });
      expect(await linksOf(trx, id)).toEqual([]);
    });
  });

  it("leaves the organiser able to hand the event over again, to the same address too", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await anEvent(trx);
      const { to } = await aTransferThatWaits(trx, id, proof);
      await handOverEvent(id, proof, { op: "cancel" }, handing(trx).deps);
      expect(await handOverEvent(id, proof, { op: "start", email: to }, handing(trx).deps)).toEqual({ ok: true, transfer: { email: to, send: "sending" } });
    });
  });

  it("is not stopped by a limit, and writes no send", async () => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await anEvent(trx);
      for (let n = 0; n < TRANSFERS_PER_EVENT; n++) await handOverEvent(id, proof, { op: "start", email: anAddress() }, handing(trx).deps);
      const sends = await sendsOf(trx, id);
      expect(await handOverEvent(id, proof, { op: "cancel" }, handing(trx).deps)).toMatchObject({ ok: true });
      expect(await sendsOf(trx, id)).toEqual(sends);
    });
  });
});

describe("OT2.10: no transfer waits, or the event has changed hands", () => {
  it.each([[{ op: "change", email: "autre@exemple.fr" }], [{ op: "resend" }], [{ op: "cancel" }]])(
    "%j with no transfer waiting is `gone`, and nothing is written nor sent",
    async (request) => {
      await withRollbackRecordingSends(async (trx) => {
        const { id, proof } = await anEvent(trx);
        const before = await snapshot(trx, id);
        const { deps, sent, queued } = handing(trx);
        expect(await handOverEvent(id, proof, request, deps)).toEqual({ ok: false, error: "gone" });
        expect(await snapshot(trx, id)).toEqual(before);
        expect(sent).toEqual([]);
        expect(queued()).toBe(0);
      });
    },
  );

  it.each([[{ op: "change", email: "autre@exemple.fr" }], [{ op: "resend" }], [{ op: "cancel" }]])(
    "%j after the recipient accepted (simulated in the database) is `noOrganiserAccess`, and nothing is written nor sent",
    async (request) => {
      await withRollbackRecordingSends(async (trx) => {
        const { id, proof, token } = await anEvent(trx);
        await aTransferThatWaits(trx, id, proof);
        // What the acceptance does (T8): the event goes to the recipient's account, the token is revoked, the transfer is over.
        const recipient = await seedAccount(trx);
        await trx.deleteFrom("email_link").where("event_id", "=", id).execute();
        await trx
          .updateTable("event")
          .set({ account_id: recipient, admin_token_hash: null, transfer_email: null, transfer_status: null, transfer_status_at: null })
          .where("id", "=", id)
          .execute();
        const before = await snapshot(trx, id);
        const { deps, sent } = handing(trx);
        for (const owner of [proof, { adminToken: token }]) {
          expect(await handOverEvent(id, owner, request, deps)).toEqual({ ok: false, error: "noOrganiserAccess" });
        }
        expect(await snapshot(trx, id)).toEqual(before);
        expect(sent).toEqual([]);
      });
    },
  );

  it.each([[{ op: "resend" }], [{ op: "cancel" }]])("%j: nobody, a wrong token and another account's session are `noOrganiserAccess`", async (request) => {
    await withRollbackRecordingSends(async (trx) => {
      const { id, proof } = await anEvent(trx);
      await aTransferThatWaits(trx, id, proof);
      const stranger = await seedSession(trx, await seedAccount(trx));
      const before = await snapshot(trx, id);
      const { deps, sent } = handing(trx);
      for (const visitor of [{}, undefined, { adminToken: "x".repeat(22) }, { session: stranger }]) {
        expect(await handOverEvent(id, visitor, request, deps)).toEqual({ ok: false, error: "noOrganiserAccess" });
      }
      expect(await snapshot(trx, id)).toEqual(before);
      expect(sent).toEqual([]);
    });
  });
});

describe("OT4.3: resend and cancel decide the access again under the lock", () => {
  it.each([
    ["resend", "session"],
    ["resend", "adminToken"],
    ["cancel", "session"],
    ["cancel", "adminToken"],
  ] as const)("`%s`: %s revoked while the request waits for the lock is `noOrganiserAccess`, and nothing is written", async (op, by) => {
    await withCommittedAddresses((_, address) =>
      withCommittedEvent(async (db, eventId, token) => {
        const accountId = await seedAccount(db, { email: address() });
        await db.updateTable("event").set({ account_id: accountId, confirmed_at: new Date() }).where("id", "=", eventId).execute();
        const session = await seedSession(db, accountId);
        const to = address();
        await db.updateTable("event").set({ transfer_email: to, transfer_status: "sent", transfer_status_at: new Date() }).where("id", "=", eventId).execute();
        const proof = by === "session" ? { session } : { adminToken: token };
        const { deps, sent } = handing(db);
        const answer = await whileHeld(
          db,
          async (trx) => {
            await lockEvent(trx, eventId, "noKeyUpdate");
            if (by === "adminToken") await trx.updateTable("event").set({ admin_token_hash: null }).where("id", "=", eventId).execute();
          },
          (own) => handOverEvent(eventId, proof, { op }, { ...deps, db: own }),
          async () => {
            if (by === "session") await closeSession(db, session);
          },
        );
        expect(answer).toEqual({ ok: false, error: "noOrganiserAccess" });
        expect(await eventRow(db, eventId)).toMatchObject({ transfer_email: to, transfer_status: "sent" });
        expect(await linksOf(db, eventId)).toEqual([]);
        expect(sent).toEqual([]);
      }),
    );
  });
});
