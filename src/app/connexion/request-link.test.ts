import { sql, type Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findLink } from "@/db/email-links";
import { SEND_LOCK_CLASS } from "@/db/email-sends";
import type { Database } from "@/db/schema";
import { anAddress, seedAccount, seedSends, withCommittedAddresses } from "@/db/test-accounts";
import { withRollback } from "@/db/test-db";
import { seedEvent } from "@/db/test-events";
import { tokenKey } from "@/db/token-key";
import { GLOBAL_SENDS_PER_HOUR, LOGINS_PER_ADDRESS } from "@/domain/send-limits";
import type { Brevo, Email, SendAnswer } from "@/email/brevo";
import type { Locale } from "@/i18n/locales";
import { requestLoginLink, type LoginLinkAnswer } from "./request-link";

const ORIGIN = "https://fullcar.test";
const MINUTE = 60_000;
const ago = (ms: number) => new Date(Date.now() - ms);

/** Brevo as the use case sees it: every email it is given, answered `answer`, or what `onSend` answers. */
function fakeBrevo(answer: SendAnswer["state"] = "sent", onSend?: (email: Email) => Promise<void>) {
  const sent: Email[] = [];
  const brevo: Brevo = {
    send: vi.fn(async (email: Email) => {
      sent.push(email);
      await onSend?.(email);
      return { state: answer };
    }),
  };
  return { brevo, sent };
}

function request(db: Kysely<Database>, brevo: Brevo, email: unknown, more: { returnEventId?: unknown; locale?: Locale } = {}) {
  const { returnEventId = null, locale = "fr" } = more;
  return requestLoginLink(db, brevo, { email, returnEventId, locale, origin: ORIGIN });
}

/** The token of a sign-in email, read from its link: `/connexion/lien#{token}`, nothing else. */
function tokenOf(email: Email): string {
  const url = new URL(/https:\/\/\S+\/connexion\/lien#\S+/.exec(email.text)![0]);
  expect(url.origin).toBe(ORIGIN);
  expect(url.pathname).toBe("/connexion/lien");
  expect(url.search).toBe("");
  return url.hash.slice(1);
}

const accountsOf = (db: Kysely<Database>, email: string) =>
  db.selectFrom("account").select("id").where("email", "=", email).execute();
const loginLinks = (db: Kysely<Database>) => db.selectFrom("email_link").select("token_hash").where("kind", "=", "login").execute();
const sendsTo = (db: Kysely<Database>, email: string) =>
  db.selectFrom("email_send").select(["kind", "event_id"]).where("email", "=", email).execute();

/** Every line written to the console, by any of its methods. */
let logs: string[];
beforeEach(() => {
  logs = [];
  for (const level of ["log", "info", "warn", "error", "debug", "trace"] as const) {
    vi.spyOn(console, level).mockImplementation((...args) => void logs.push(args.map(String).join(" ")));
  }
});
afterEach(() => vi.restoreAllMocks());

describe("requestLoginLink", () => {
  it("sends a sign-in link to an address with an account: /connexion/lien, the token after #, kept hashed", async () => {
    await withRollback(async (trx) => {
      const email = anAddress();
      const accountId = await seedAccount(trx, { email });
      const { brevo, sent } = fakeBrevo();
      const answer = await request(trx, brevo, email);
      expect(answer).toEqual({ state: "sent" });
      expect(sent).toHaveLength(1);
      expect(sent[0]!.to).toBe(email);
      expect(sent[0]!.subject).toBe("Votre lien de connexion à Fullcar");
      const token = tokenOf(sent[0]!);
      expect(sent[0]!.html).toContain(`href="${ORIGIN}/connexion/lien#${token}"`);
      expect(await findLink(trx, token)).toMatchObject({ kind: "login", accountId, usedAt: null, returnEventId: null });
      // The database keeps the token's hash, and the answer carries no token.
      expect(await loginLinks(trx)).toContainEqual({ token_hash: tokenKey(token) });
      expect(JSON.stringify(answer)).not.toContain(token);
      expect(await sendsTo(trx, email)).toEqual([{ kind: "login", event_id: null }]);
    });
  });

  // OA3.5, decision 11: the same answer, an email still, and no account kept for nothing.
  it("sends the « adresse sans compte » email to an address without an account, and creates neither account nor link", async () => {
    await withRollback(async (trx) => {
      const email = anAddress();
      const linksBefore = (await loginLinks(trx)).length;
      const { brevo, sent } = fakeBrevo();
      expect(await request(trx, brevo, email)).toEqual({ state: "sent" });
      expect(sent).toHaveLength(1);
      expect(sent[0]!.to).toBe(email);
      expect(sent[0]!.subject).toBe("Connexion à Fullcar");
      expect(sent[0]!.text).toContain(`${ORIGIN}/nouveau`);
      expect(sent[0]!.text).not.toContain("#");
      expect(await accountsOf(trx, email)).toEqual([]);
      expect(await loginLinks(trx)).toHaveLength(linksBefore);
      expect(await sendsTo(trx, email)).toEqual([{ kind: "login", event_id: null }]);
    });
  });

  // OA4.2: the page cannot tell who has an account, whatever Brevo answers.
  it("answers an address with an account and one without alike, sent or failed", async () => {
    await withRollback(async (trx) => {
      const withAccount = anAddress();
      await seedAccount(trx, { email: withAccount });
      for (const state of ["sent", "failed"] as const) {
        const answers: LoginLinkAnswer[] = [];
        for (const email of [withAccount, anAddress()]) answers.push(await request(trx, fakeBrevo(state).brevo, email));
        expect(answers[0]).toEqual({ state });
        expect(answers[1]).toEqual(answers[0]);
      }
    });
  });

  it("reads the address as email-address.ts does, and refuses one it cannot read without recording or sending", async () => {
    await withRollback(async (trx) => {
      const email = anAddress();
      const accountId = await seedAccount(trx, { email });
      const { brevo, sent } = fakeBrevo();
      expect(await request(trx, brevo, `  ${email.toUpperCase()} `)).toEqual({ state: "sent" });
      expect(await findLink(trx, tokenOf(sent[0]!))).toMatchObject({ accountId });
      for (const [typed, error] of [["", "required"], ["camille@localhost", "invalid"], [42, "invalid"]] as const) {
        expect(await request(trx, brevo, typed)).toEqual({ state: "invalid", error });
      }
      expect(sent).toHaveLength(1);
      expect(await sendsTo(trx, "camille@localhost")).toEqual([]);
    });
  });

  it("writes the email in the page's language", async () => {
    await withRollback(async (trx) => {
      const email = anAddress();
      await seedAccount(trx, { email, locale: "fr" });
      const { brevo, sent } = fakeBrevo();
      await request(trx, brevo, email, { locale: "en" });
      await request(trx, brevo, anAddress(), { locale: "en" });
      expect(sent.map(({ subject }) => subject)).toEqual(["Your Fullcar sign-in link", "Signing in to Fullcar"]);
    });
  });

  // OA4.4: the link lands where the sign-in was asked for.
  describe("the return target, kept with the link", () => {
    it("is the event the request came from, when it exists", async () => {
      await withRollback(async (trx) => {
        const email = anAddress();
        await seedAccount(trx, { email });
        const { id } = await seedEvent(trx);
        const { brevo, sent } = fakeBrevo();
        await request(trx, brevo, email, { returnEventId: id });
        expect(await findLink(trx, tokenOf(sent[0]!))).toMatchObject({ returnEventId: id });
      });
    });

    it("is /mes-evenements for an unknown event or anything that is not an event id", async () => {
      await withRollback(async (trx) => {
        const email = anAddress();
        await seedAccount(trx, { email });
        const { brevo, sent } = fakeBrevo();
        for (const returnEventId of ["zzzzzzzz", "../admin", 42, { id: "x" }, undefined]) {
          expect(await request(trx, brevo, email, { returnEventId })).toEqual({ state: "sent" });
        }
        for (const email of sent) expect(await findLink(trx, tokenOf(email))).toMatchObject({ returnEventId: null });
      });
    });
  });

  // OA4.5, decision 9: 5 sign-in requests per hour and per address, with or without an account.
  describe("the limits", () => {
    it("stops the 6th request of the hour for an address, with or without an account, and sends nothing", async () => {
      await withRollback(async (trx) => {
        const withAccount = anAddress();
        await seedAccount(trx, { email: withAccount });
        const without = anAddress();
        await seedSends(trx, LOGINS_PER_ADDRESS - 1, { kind: "login", email: withAccount });
        await seedSends(trx, LOGINS_PER_ADDRESS - 1, { kind: "login", email: without });
        const linksBefore = (await loginLinks(trx)).length;
        const { brevo, sent } = fakeBrevo();
        for (const email of [withAccount, without]) {
          expect(await request(trx, brevo, email)).toEqual({ state: "sent" });
          expect(await request(trx, brevo, email)).toEqual({ state: "tooMany" });
        }
        expect(sent.map(({ to }) => to)).toEqual([withAccount, without]);
        expect(await loginLinks(trx)).toHaveLength(linksBefore + 1);
        expect(await sendsTo(trx, without)).toHaveLength(LOGINS_PER_ADDRESS);
      });
    });

    it("no longer counts a request of an hour ago, nor a confirmation email to the address", async () => {
      await withRollback(async (trx) => {
        const email = anAddress();
        await seedSends(trx, LOGINS_PER_ADDRESS, { kind: "login", email, sentAt: ago(61 * MINUTE) });
        await seedSends(trx, LOGINS_PER_ADDRESS, { kind: "confirmation", email });
        expect(await request(trx, fakeBrevo().brevo, email)).toEqual({ state: "sent" });
      });
    });

    it("says too many requests at the global cap too, and sends nothing", async () => {
      await withRollback(async (trx) => {
        await seedSends(trx, GLOBAL_SENDS_PER_HOUR, { kind: "login", email: () => anAddress() });
        const email = anAddress();
        await seedAccount(trx, { email });
        const { brevo, sent } = fakeBrevo();
        expect(await request(trx, brevo, email)).toEqual({ state: "tooMany" });
        expect(await request(trx, brevo, anAddress())).toEqual({ state: "tooMany" });
        expect(sent).toEqual([]);
      });
    });

    // A send Brevo refused or did not answer in 10 s counts: Brevo may still have accepted it.
    it("counts a failed send, and keeps its link valid", async () => {
      await withRollback(async (trx) => {
        const email = anAddress();
        await seedAccount(trx, { email });
        const { brevo, sent } = fakeBrevo("failed");
        expect(await request(trx, brevo, email)).toEqual({ state: "failed" });
        expect(await sendsTo(trx, email)).toHaveLength(1);
        expect(await findLink(trx, tokenOf(sent[0]!))).toMatchObject({ usedAt: null });
      });
    });
  });

  // OA5.10, OA11.1.
  it("logs neither the address nor the token, sent or failed", async () => {
    await withRollback(async (trx) => {
      const email = anAddress();
      await seedAccount(trx, { email });
      const { brevo, sent } = fakeBrevo("failed");
      await request(trx, brevo, email);
      await request(trx, brevo, anAddress());
      const token = tokenOf(sent[0]!);
      for (const line of logs) {
        expect(line).not.toContain(email);
        expect(line).not.toContain(sent[1]!.to);
        expect(line).not.toContain(token);
      }
    });
  });

  // docs/agents/architecture.md, « L'adresse après l'Event »: the email goes out once committed.
  it("calls Brevo once the send and the link are committed, with the address lock released", async () => {
    await withCommittedAddresses(async (db, address) => {
      const email = address();
      const accountId = await seedAccount(db, { email });
      const seen: unknown[] = [];
      const { brevo } = fakeBrevo("sent", async (sentEmail) => {
        const { rows } = await sql<{ free: boolean }>`
          select pg_try_advisory_xact_lock(${SEND_LOCK_CLASS.address}::int, hashtext(${email})) as free`.execute(db);
        const link = await findLink(db, tokenOf(sentEmail));
        seen.push(rows[0]!.free, await sendsTo(db, email), link?.accountId);
      });
      expect(await request(db, brevo, email)).toEqual({ state: "sent" });
      expect(seen).toEqual([true, [{ kind: "login", event_id: null }], accountId]);
    });
  });
});
