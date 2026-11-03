import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { anonymiseEvent } from "./day-thirty";
import { readMyEventRows } from "./my-events";
import type { Database } from "./schema";
import { anAddress, seedAccount } from "./test-accounts";
import { withRollback } from "./test-db";
import { removeSeededRetour, seedEvent } from "./test-events";
import { seedPerson, seedPlacement, seedRide } from "./test-participants";

/** The event confirmed by `accountId`, as a used confirmation link leaves it. */
async function confirm(db: Kysely<Database>, eventId: string, accountId: string): Promise<void> {
  await db.updateTable("event").set({ account_id: accountId, confirmed_at: new Date() }).where("id", "=", eventId).execute();
}

/** An event of the account, from `seedEvent`'s fields. */
async function seedEventOf(db: Kysely<Database>, accountId: string, fields: Parameters<typeof seedEvent>[1] = {}): Promise<string> {
  const { id } = await seedEvent(db, fields);
  await confirm(db, id, accountId);
  return id;
}

/** A person without a car on each of `legs`. */
async function seedWithoutCar(db: Kysely<Database>, eventId: string, legs: ("aller" | "retour")[], phone: string | null = null) {
  const person = await seedPerson(db, eventId, { phone });
  for (const leg of legs) await seedPlacement(db, { personId: person.id, eventId, leg, rideId: null });
  return person.id;
}

describe("readMyEventRows", () => {
  it("reads the account's events, with their own fields", async () => {
    await withRollback(async (trx) => {
      const accountId = await seedAccount(trx);
      const id = await seedEventOf(trx, accountId, { title: "Tournoi de Vitré", location: "Salle Louis Lemonnier" });
      const allerOnly = await seedEventOf(trx, accountId, { allerAt: "2026-12-19 09:00:00", retourAt: null });
      const rows = await readMyEventRows(trx, accountId);
      expect(rows.toSorted((a, b) => (a.allerAt < b.allerAt ? -1 : 1))).toEqual([
        {
          id,
          title: "Tournoi de Vitré",
          location: "Salle Louis Lemonnier",
          allerAt: "2026-12-12 07:30:00",
          retourAt: "2026-12-12 18:00:00",
          accountId,
          confirmed: true,
          anonymised: false,
          persons: 0,
          withoutCar: { aller: 0, retour: 0 },
          transferEmail: null,
        },
        expect.objectContaining({ id: allerOnly, allerAt: "2026-12-19 09:00:00", retourAt: null }),
      ]);
    });
  });

  // OT2.8: the address stays whether the link still serves or not: the row reads only the column.
  it("reads the address the event is handed to, and none for an event without a handover", async () => {
    await withRollback(async (trx) => {
      const accountId = await seedAccount(trx);
      const handed = await seedEventOf(trx, accountId, { allerAt: "2026-12-19 09:00:00", retourAt: null });
      const kept = await seedEventOf(trx, accountId, { allerAt: "2026-12-20 09:00:00", retourAt: null });
      await trx
        .updateTable("event")
        .set({ transfer_email: "dominique@exemple.fr", transfer_status: "sent", transfer_status_at: new Date() })
        .where("id", "=", handed)
        .execute();
      const rows = await readMyEventRows(trx, accountId);
      expect(rows.find((row) => row.id === handed)).toMatchObject({ transferEmail: "dominique@exemple.fr" });
      expect(rows.find((row) => row.id === kept)).toMatchObject({ transferEmail: null });
    });
  });

  // OA2.3: until its confirmation link has served, the event is in no account's list.
  it("reads no pending event, even one awaiting the account's own address, nor another account's", async () => {
    await withRollback(async (trx) => {
      const email = anAddress();
      const accountId = await seedAccount(trx, { email });
      const pending = await seedEvent(trx);
      await trx.updateTable("event").set({ pending_email: email }).where("id", "=", pending.id).execute();
      await seedEventOf(trx, await seedAccount(trx));
      expect(await readMyEventRows(trx, accountId)).toEqual([]);
    });
  });

  // OA6.2: the persons signed up, and the persons without a car, leg by leg.
  it("counts the persons, and those without a car on each leg, drivers and passengers apart", async () => {
    await withRollback(async (trx) => {
      const accountId = await seedAccount(trx);
      const id = await seedEventOf(trx, accountId);
      const driver = await seedPerson(trx, id, { firstName: "Hugo" });
      const rideId = await seedRide(trx, id, driver.id, { leg: "aller" });
      const passenger = await seedPerson(trx, id, { firstName: "Inès" });
      await seedPlacement(trx, { personId: passenger.id, eventId: id, leg: "aller", rideId });
      await seedPlacement(trx, { personId: passenger.id, eventId: id, leg: "retour", rideId: null });
      await seedWithoutCar(trx, id, ["aller", "retour"]);
      await seedWithoutCar(trx, id, ["retour"]);
      // Signed up, concerned by no leg.
      await seedPerson(trx, id, { firstName: "Jade" });
      const [row] = await readMyEventRows(trx, accountId);
      expect(row).toMatchObject({ id, persons: 5, withoutCar: { aller: 1, retour: 3 } });
    });
  });

  it("counts each event apart", async () => {
    await withRollback(async (trx) => {
      const accountId = await seedAccount(trx);
      const busy = await seedEventOf(trx, accountId);
      const quiet = await seedEventOf(trx, accountId, { allerAt: "2026-12-19 09:00:00", retourAt: null });
      await seedWithoutCar(trx, busy, ["aller"]);
      await seedWithoutCar(trx, busy, ["aller"]);
      const rows = await readMyEventRows(trx, accountId);
      expect(rows.find((row) => row.id === busy)).toMatchObject({ persons: 2, withoutCar: { aller: 2, retour: 0 } });
      expect(rows.find((row) => row.id === quiet)).toMatchObject({ persons: 0, withoutCar: { aller: 0, retour: 0 } });
    });
  });

  it("counts no retour once the organiser removed it", async () => {
    await withRollback(async (trx) => {
      const accountId = await seedAccount(trx);
      const id = await seedEventOf(trx, accountId);
      await seedWithoutCar(trx, id, ["aller", "retour"]);
      await removeSeededRetour(trx, id);
      const [row] = await readMyEventRows(trx, accountId);
      expect(row).toMatchObject({ retourAt: null, persons: 1, withoutCar: { aller: 1, retour: 0 } });
    });
  });

  // OA6.4: anonymised, its title, place and dates stay, and nobody is left.
  it("reads an anonymised event as such, with its title, place and dates", async () => {
    await withRollback(async (trx) => {
      const accountId = await seedAccount(trx);
      const id = await seedEventOf(trx, accountId, { allerAt: "2026-10-01 07:30:00", retourAt: "2026-10-01 18:00:00" });
      await seedWithoutCar(trx, id, ["aller"]);
      await anonymiseEvent(trx, id);
      expect(await readMyEventRows(trx, accountId)).toEqual([
        expect.objectContaining({
          id,
          title: "Tournoi de Rennes",
          location: "Gymnase des Gayeulles",
          allerAt: "2026-10-01 07:30:00",
          retourAt: "2026-10-01 18:00:00",
          anonymised: true,
          persons: 0,
        }),
      ]);
    });
  });

  it("carries no phone number, nor any first name: aggregates only", async () => {
    await withRollback(async (trx) => {
      const accountId = await seedAccount(trx);
      const id = await seedEventOf(trx, accountId);
      await seedWithoutCar(trx, id, ["aller"], "06 12 34 56 78");
      const answer = JSON.stringify(await readMyEventRows(trx, accountId));
      expect(answer).not.toContain("06 12 34 56 78");
      expect(answer).not.toContain("0612345678");
      expect(answer).not.toContain("Léa");
      expect(answer).not.toMatch(/phone|token/i);
    });
  });
});
