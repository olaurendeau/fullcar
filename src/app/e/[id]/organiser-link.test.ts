import { describe, expect, it } from "vitest";
import { anonymiseEvent } from "@/db/day-thirty";
import { seedAccount, seedSession } from "@/db/test-accounts";
import { withRollback } from "@/db/test-db";
import { confirmSeededEvent, seedEvent } from "@/db/test-events";
import { readOrganiserLink } from "./organiser-link";

const oneCharOff = (token: string) => `${token.slice(0, -1)}${token.at(-1) === "A" ? "B" : "A"}`;

/*
 * OA7.4: « Espace organisateur » on /e/{id} is for the organiser's session and for the browser
 * that keeps the admin token, by the one rule (organiser-access.ts); nobody else, and no
 * reason is given to anybody else.
 */
describe("readOrganiserLink", () => {
  it("OA7.4: the session of the event's account", async () => {
    await withRollback(async (trx) => {
      const { id } = await seedEvent(trx);
      const session = await seedSession(trx, await confirmSeededEvent(trx, id));
      expect(await readOrganiserLink(trx, id, { session })).toBe(true);
    });
  });

  it("OA7.4: the creation browser's token, the event pending or confirmed", async () => {
    await withRollback(async (trx) => {
      const { id, token } = await seedEvent(trx);
      expect(await readOrganiserLink(trx, id, { adminToken: token })).toBe(true);
      await confirmSeededEvent(trx, id);
      expect(await readOrganiserLink(trx, id, { adminToken: token })).toBe(true);
    });
  });

  it("OA7.4: a participant, a token one character off, a malformed proof: no link", async () => {
    await withRollback(async (trx) => {
      const { id, token } = await seedEvent(trx);
      for (const proof of [undefined, null, "text", {}, { adminToken: oneCharOff(token) }, { session: "no-session" }]) {
        expect(await readOrganiserLink(trx, id, proof)).toBe(false);
      }
    });
  });

  it("OA7.4: another account's session: no link", async () => {
    await withRollback(async (trx) => {
      const { id } = await seedEvent(trx);
      await confirmSeededEvent(trx, id);
      const other = await seedSession(trx, await seedAccount(trx));
      expect(await readOrganiserLink(trx, id, { session: other })).toBe(false);
    });
  });

  it("OA7.9: without an organiser, the token left behind included: no link", async () => {
    await withRollback(async (trx) => {
      const { id, token } = await seedEvent(trx);
      const account = await confirmSeededEvent(trx, id);
      await trx.deleteFrom("account").where("id", "=", account).execute();
      expect(await readOrganiserLink(trx, id, { adminToken: token })).toBe(false);
    });
  });

  it("OA8.3: anonymised, its organiser's session included: nothing is left to organise", async () => {
    await withRollback(async (trx) => {
      const { id, token } = await seedEvent(trx);
      const session = await seedSession(trx, await confirmSeededEvent(trx, id));
      await anonymiseEvent(trx, id);
      expect(await readOrganiserLink(trx, id, { session, adminToken: token })).toBe(false);
    });
  });

  it("an unknown or malformed id: no link", async () => {
    await withRollback(async (trx) => {
      expect(await readOrganiserLink(trx, "Zz9Zz9Zz", {})).toBe(false);
      expect(await readOrganiserLink(trx, "../x", {})).toBe(false);
    });
  });
});
