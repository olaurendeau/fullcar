import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { anonymiseEvent } from "@/db/day-thirty";
import type { Database } from "@/db/schema";
import { anAddress, seedAccount, seedSession } from "@/db/test-accounts";
import { withRollback } from "@/db/test-db";
import { seedEvent } from "@/db/test-events";
import { seedPerson, seedPlacement } from "@/db/test-participants";
import { readMyEvents } from "./my-events";

/** 2026-12-12 13:00:00 in Paris. */
const NOW = new Date("2026-12-12T12:00:00Z");
const DAY = 24 * 60 * 60_000;
const daysBefore = (days: number) => new Date(NOW.getTime() - days * DAY);

/** An event confirmed by `accountId`, from `seedEvent`'s fields. */
async function seedEventOf(db: Kysely<Database>, accountId: string, fields: Parameters<typeof seedEvent>[1] = {}): Promise<string> {
  const { id } = await seedEvent(db, fields);
  await db.updateTable("event").set({ account_id: accountId, confirmed_at: daysBefore(60) }).where("id", "=", id).execute();
  return id;
}

/** An account with an open session, visited yesterday. */
async function signedIn(db: Kysely<Database>, email = anAddress()) {
  const accountId = await seedAccount(db, { email });
  const token = await seedSession(db, accountId, { createdAt: daysBefore(10), lastVisitAt: daysBefore(1) });
  return { accountId, token, email };
}

describe("readMyEvents", () => {
  it("OA6.1, OA6.3, OA6.4: gives the session's address, its upcoming events, then its past ones", async () => {
    await withRollback(async (trx) => {
      const { accountId, token, email } = await signedIn(trx);
      const later = await seedEventOf(trx, accountId, { title: "Plus tard", allerAt: "2027-01-09 09:00:00", retourAt: null });
      const soon = await seedEventOf(trx, accountId, { title: "Bientôt", allerAt: "2026-12-19 09:00:00", retourAt: null });
      const past = await seedEventOf(trx, accountId, { title: "Passé", allerAt: "2026-12-05 09:00:00", retourAt: "2026-12-06 18:00:00" });
      const person = await seedPerson(trx, past);
      await seedPlacement(trx, { personId: person.id, eventId: past, leg: "retour", rideId: null });
      const erased = await seedEventOf(trx, accountId, { title: "Effacé", allerAt: "2026-10-03 09:00:00", retourAt: null });
      await anonymiseEvent(trx, erased);

      expect(await readMyEvents(trx, token, NOW)).toEqual({
        state: "events",
        email,
        upcoming: [
          expect.objectContaining({ state: "upcoming", id: soon, title: "Bientôt", persons: 0, withoutCar: [] }),
          expect.objectContaining({ state: "upcoming", id: later, title: "Plus tard" }),
        ],
        past: [
          {
            state: "past",
            id: past,
            title: "Passé",
            start: "2026-12-05 09:00:00",
            location: "Gymnase des Gayeulles",
            persons: 1,
            withoutCar: [{ leg: "retour", count: 1 }],
            erasedOn: "2027-01-05",
          },
          { state: "erased", id: erased, title: "Effacé", start: "2026-10-03 09:00:00", location: "Gymnase des Gayeulles" },
        ],
      });
    });
  });

  it("OA6.1: an event whose retour is tonight in Paris is still upcoming", async () => {
    await withRollback(async (trx) => {
      const { accountId, token } = await signedIn(trx);
      const tonight = await seedEventOf(trx, accountId, { allerAt: "2026-12-12 07:30:00", retourAt: "2026-12-12 18:00:00" });
      const answer = await readMyEvents(trx, token, NOW);
      expect(answer).toMatchObject({ state: "events", upcoming: [{ id: tonight }], past: [] });
    });
  });

  // OA2.3: pending, the event is in no account's list, that of its own address included.
  it("OA2.3: lists no pending event, even with a session of the very address it awaits", async () => {
    await withRollback(async (trx) => {
      const { token, email } = await signedIn(trx);
      const pending = await seedEvent(trx);
      await trx.updateTable("event").set({ pending_email: email }).where("id", "=", pending.id).execute();
      expect(await readMyEvents(trx, token, NOW)).toEqual({ state: "events", email, upcoming: [], past: [] });
    });
  });

  it("lists only the session's account's events, not another account's", async () => {
    await withRollback(async (trx) => {
      const mine = await signedIn(trx);
      const theirs = await signedIn(trx);
      const id = await seedEventOf(trx, theirs.accountId);
      expect(await readMyEvents(trx, mine.token, NOW)).toMatchObject({ upcoming: [], past: [] });
      expect(await readMyEvents(trx, theirs.token, NOW)).toMatchObject({ upcoming: [{ id }] });
    });
  });

  // OA6.8: without a session, the page leads to /connexion.
  it("OA6.8: answers signIn for a session last visited 91 days ago", async () => {
    await withRollback(async (trx) => {
      const accountId = await seedAccount(trx);
      await seedEventOf(trx, accountId);
      const token = await seedSession(trx, accountId, { createdAt: daysBefore(200), lastVisitAt: daysBefore(91) });
      expect(await readMyEvents(trx, token, NOW)).toEqual({ state: "signIn" });
    });
  });

  it.each([
    ["an unknown token", "AAAAAAAAAAAAAAAAAAAAAA"],
    ["nothing", undefined],
    ["a number", 42],
    ["an object", { session: "kP3x-Vb7_Zq9Lt2Wn8Rc4g" }],
  ])("OA6.8: answers signIn for %s", async (_, token) => {
    await withRollback(async (trx) => {
      expect(await readMyEvents(trx, token, NOW)).toEqual({ state: "signIn" });
    });
  });

  it("answers nothing of the token, and writes nothing: the visit is session-visit.tsx's", async () => {
    await withRollback(async (trx) => {
      const { accountId, token } = await signedIn(trx);
      await seedEventOf(trx, accountId);
      const visitsOf = () =>
        Promise.all([
          trx.selectFrom("session").select("last_visit_at").where("account_id", "=", accountId).executeTakeFirstOrThrow(),
          trx.selectFrom("account").select("last_visit_at").where("id", "=", accountId).executeTakeFirstOrThrow(),
        ]);
      const before = await visitsOf();
      expect(JSON.stringify(await readMyEvents(trx, token, NOW))).not.toContain(token);
      expect(await visitsOf()).toEqual(before);
    });
  });
});
