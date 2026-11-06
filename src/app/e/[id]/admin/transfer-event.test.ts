import type { Kysely } from "kysely";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/schema";
import { anAddress, seedSends, seedSession, withRollbackRecordingSends } from "@/db/test-accounts";
import { confirmSeededEvent, seedEvent } from "@/db/test-events";
import type { Email } from "@/email/brevo";
import { transferEvent } from "./actions";

// The action reaches the database through getDb(): here, the test's transaction. Its Brevo is
// the test's, never the network's; the language is the page's, read by next-intl; `after()` queues.
const wiring = vi.hoisted(() => ({
  db: undefined as Kysely<Database> | undefined,
  locale: "fr",
  sent: [] as Email[],
  tasks: [] as (() => Promise<unknown>)[],
}));
vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  return { ...actual, getDb: () => wiring.db ?? actual.getDb() };
});
vi.mock("@/email/brevo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/email/brevo")>();
  return { ...actual, serverBrevo: () => ({ send: async (email: Email) => (wiring.sent.push(email), { state: "sent" as const }) }) };
});
vi.mock("next-intl/server", () => ({ getLocale: async () => wiring.locale }));
vi.mock("next/server", () => ({ after: (task: () => Promise<unknown>) => void wiring.tasks.push(task) }));

afterEach(() => {
  wiring.db = undefined;
  wiring.locale = "fr";
  wiring.sent = [];
  wiring.tasks = [];
});

async function anEvent(trx: Kysely<Database>) {
  const { id } = await seedEvent(trx);
  const accountId = await confirmSeededEvent(trx, id);
  return { id, proof: { session: await seedSession(trx, accountId) } };
}

describe("transferEvent (epic #935, OT1, OT6)", () => {
  it("answers at once, then sends the email after the answer, in the page's language", async () => {
    await withRollbackRecordingSends(async (trx) => {
      wiring.db = trx;
      wiring.locale = "en";
      const { id, proof } = await anEvent(trx);
      const to = anAddress();
      expect(await transferEvent(id, proof, { op: "start", email: to })).toEqual({ ok: true, transfer: { email: to, send: "sending" } });
      expect(wiring.sent).toEqual([]);
      for (const task of wiring.tasks) await task();
      expect(wiring.sent).toHaveLength(1);
      expect(wiring.sent[0]).toMatchObject({ to, subject: expect.stringContaining("Fullcar") });
    });
  });

  it("OT6.5: the fourth request of an hour for an event is refused with `tooMany`", async () => {
    await withRollbackRecordingSends(async (trx) => {
      wiring.db = trx;
      const { id, proof } = await anEvent(trx);
      for (let n = 0; n < 3; n++) expect(await transferEvent(id, proof, { op: "start", email: anAddress() })).toMatchObject({ ok: true });
      expect(await transferEvent(id, proof, { op: "start", email: anAddress() })).toEqual({ ok: false, error: "tooMany" });
      expect(wiring.tasks).toHaveLength(3);
    });
  });

  it("OT6.5: the sixth request of an hour to one address is stopped by the limit of the address: the transfer is kept, nothing goes out", async () => {
    await withRollbackRecordingSends(async (trx) => {
      wiring.db = trx;
      const { id, proof } = await anEvent(trx);
      const to = anAddress();
      await seedSends(trx, 5, { kind: "transfer", email: to, eventId: null });
      expect(await transferEvent(id, proof, { op: "start", email: to })).toEqual({ ok: true, transfer: { email: to, send: "addressLimit" } });
      expect(wiring.tasks).toEqual([]);
      expect(wiring.sent).toEqual([]);
    });
  });

  it("OT2.3 / OT2.5: a resend waits for Brevo and queues nothing, a cancel answers the address", async () => {
    await withRollbackRecordingSends(async (trx) => {
      wiring.db = trx;
      const { id, proof } = await anEvent(trx);
      const to = anAddress();
      await transferEvent(id, proof, { op: "start", email: to });
      for (const task of wiring.tasks.splice(0)) await task();
      wiring.sent = [];
      expect(await transferEvent(id, proof, { op: "resend" })).toEqual({ ok: true, transfer: { email: to, send: "sent" } });
      expect(wiring.sent).toHaveLength(1);
      expect(wiring.tasks).toEqual([]);
      expect(await transferEvent(id, proof, { op: "cancel" })).toEqual({ ok: true, cancelled: to });
      expect(await transferEvent(id, proof, { op: "cancel" })).toEqual({ ok: false, error: "gone" });
      expect(wiring.sent).toHaveLength(1);
    });
  });

  it("refuses a request without access, and a malformed id, and sends nothing", async () => {
    await withRollbackRecordingSends(async (trx) => {
      wiring.db = trx;
      const { id } = await anEvent(trx);
      expect(await transferEvent(id, {}, { op: "start", email: anAddress() })).toEqual({ ok: false, error: "noOrganiserAccess" });
      expect(await transferEvent("../x", {}, { op: "start", email: anAddress() })).toEqual({ ok: false, error: "eventNotFound" });
      expect(wiring.tasks).toEqual([]);
    });
  });
});
