import { describe, expect, it } from "vitest";
import { anonymiseEvent } from "@/db/day-thirty";
import { seedAccount, seedSession } from "@/db/test-accounts";
import { withRollback } from "@/db/test-db";
import { confirmSeededEvent, seedEvent } from "@/db/test-events";
import { readOrganiserLink } from "./organiser-link";

/*
 * OA7.4: « Espace organisateur » on /e/{id}, for a session, is for the session of the event's
 * account alone, by the one rule (organiser-access.ts); no other account's, and no reason is
 * given to anybody else.
 */
describe("readOrganiserLink", () => {
  it("OA7.4: the session of the event's account", async () => {
    await withRollback(async (trx) => {
      const { id } = await seedEvent(trx);
      const session = await seedSession(trx, await confirmSeededEvent(trx, id));
      expect(await readOrganiserLink(trx, id, session)).toBe(true);
    });
  });

  it("OA7.4: another account's session: no link", async () => {
    await withRollback(async (trx) => {
      const { id } = await seedEvent(trx);
      await confirmSeededEvent(trx, id);
      const other = await seedSession(trx, await seedAccount(trx));
      expect(await readOrganiserLink(trx, id, other)).toBe(false);
    });
  });

  it("OA7.4: no session, an unknown or malformed token: no link", async () => {
    await withRollback(async (trx) => {
      const { id } = await seedEvent(trx);
      await confirmSeededEvent(trx, id);
      for (const session of [undefined, null, 42, {}, "no-session", { session: "x" }]) {
        expect(await readOrganiserLink(trx, id, session)).toBe(false);
      }
    });
  });

  it("OA7.7: the event still pending, whatever the session: no link", async () => {
    await withRollback(async (trx) => {
      const { id } = await seedEvent(trx);
      const session = await seedSession(trx, await seedAccount(trx));
      expect(await readOrganiserLink(trx, id, session)).toBe(false);
    });
  });

  it("OA8.3: anonymised, its organiser's session included: nothing is left to organise", async () => {
    await withRollback(async (trx) => {
      const { id } = await seedEvent(trx);
      const session = await seedSession(trx, await confirmSeededEvent(trx, id));
      await anonymiseEvent(trx, id);
      expect(await readOrganiserLink(trx, id, session)).toBe(false);
    });
  });

  it("an unknown or malformed id: no link", async () => {
    await withRollback(async (trx) => {
      const { id } = await seedEvent(trx);
      const session = await seedSession(trx, await confirmSeededEvent(trx, id));
      expect(await readOrganiserLink(trx, "Zz9Zz9Zz", session)).toBe(false);
      expect(await readOrganiserLink(trx, "../x", session)).toBe(false);
    });
  });
});
