import type { Kysely } from "kysely";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/schema";
import { withRollbackRecordingSends } from "@/db/test-accounts";
import { seedEvent, seedPendingSend } from "@/db/test-events";
import type { Email } from "@/email/brevo";
import { fixEmail } from "./actions";

// The action reaches the database through getDb(): here, the test's transaction. Its Brevo is
// the test's, never the network's; the language is the page's, read by next-intl.
const wiring = vi.hoisted(() => ({
  db: undefined as Kysely<Database> | undefined,
  locale: "fr",
  sent: [] as Email[],
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

afterEach(() => {
  wiring.db = undefined;
  wiring.locale = "fr";
  wiring.sent = [];
});

describe("fixEmail (OA2.5)", () => {
  it("sends the confirmation email to the corrected address, in the page's language", async () => {
    await withRollbackRecordingSends(async (trx) => {
      wiring.db = trx;
      wiring.locale = "en";
      const { id, token } = await seedEvent(trx);
      await seedPendingSend(trx, id, { email: "camille@exemple.fr", status: "sent" });
      expect(await fixEmail(id, { adminToken: token }, "camile@exemple.fr")).toEqual({
        ok: true,
        pending: { email: "camile@exemple.fr", send: "sent" },
      });
      expect(wiring.sent).toHaveLength(1);
      expect(wiring.sent[0]).toMatchObject({ to: "camile@exemple.fr", subject: "Confirm your email address for Fullcar" });
    });
  });

  it("refuses an address that is not one, and a request without the token, and sends nothing", async () => {
    await withRollbackRecordingSends(async (trx) => {
      wiring.db = trx;
      const { id, token } = await seedEvent(trx);
      await seedPendingSend(trx, id, { email: "camille@exemple.fr", status: "sent" });
      expect(await fixEmail(id, { adminToken: token }, "camille")).toEqual({ ok: false, error: "address", reason: "invalid" });
      expect(await fixEmail(id, {}, "camile@exemple.fr")).toEqual({ ok: false, error: "invalid" });
      expect(await fixEmail("../x", {}, "camile@exemple.fr")).toEqual({ ok: false, error: "eventNotFound" });
      expect(wiring.sent).toEqual([]);
    });
  });
});
