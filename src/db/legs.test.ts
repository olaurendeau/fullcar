import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { countLegRows, deleteLegRows } from "./legs";
import { readTokenHolders } from "./persons";
import type { Database } from "./schema";
import { withRollback } from "./test-db";
import { seedEvent } from "./test-events";
import { seedPerson, seedPlacement, seedRide } from "./test-participants";

type Db = Kysely<Database>;

/**
 * Aller: Marc drives Léa (r1), Tom is without a car. Retour: Marc drives Léa (r3), Zoé
 * drives nobody (r4), Tom is without a car. Hugo is on the aller only, without a car.
 */
async function seedScene(db: Db) {
  const { id: eventId } = await seedEvent(db);
  const persons = [];
  for (const firstName of ["Marc", "Léa", "Tom", "Zoé", "Hugo"]) persons.push(await seedPerson(db, eventId, { firstName }));
  const [marc, lea, tom, zoe, hugo] = persons;
  const r1 = await seedRide(db, eventId, marc.id, { leg: "aller" });
  const r3 = await seedRide(db, eventId, marc.id, { leg: "retour" });
  await seedRide(db, eventId, zoe.id, { leg: "retour" });
  await seedPlacement(db, { personId: lea.id, eventId, leg: "aller", rideId: r1 });
  await seedPlacement(db, { personId: tom.id, eventId, leg: "aller", rideId: null });
  await seedPlacement(db, { personId: hugo.id, eventId, leg: "aller", rideId: null });
  await seedPlacement(db, { personId: lea.id, eventId, leg: "retour", rideId: r3 });
  await seedPlacement(db, { personId: tom.id, eventId, leg: "retour", rideId: null });
  return { eventId };
}

/** The rides and Placements of the event, leg by leg. */
async function rowsOf(db: Db, eventId: string) {
  const rides = await db.selectFrom("ride").select(["id", "leg"]).where("event_id", "=", eventId).orderBy("id").execute();
  const placements = await db
    .selectFrom("placement")
    .select(["person_id", "leg", "ride_id", "placed_at"])
    .where("event_id", "=", eventId)
    .orderBy("person_id")
    .orderBy("leg")
    .execute();
  return { rides, placements };
}

describe("countLegRows", () => {
  it("counts the leg's cars, and the distinct persons who drive there or have a Placement there", async () => {
    await withRollback(async (trx) => {
      const { eventId } = await seedScene(trx);
      // Another event's retour is not counted.
      await seedScene(trx);
      expect(await countLegRows(trx, eventId, "retour")).toEqual({ cars: 2, persons: 4 });
      expect(await countLegRows(trx, eventId, "aller")).toEqual({ cars: 1, persons: 4 });
    });
  });

  it("gives 0 and 0 for an empty leg", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      await seedPerson(trx, eventId);
      expect(await countLegRows(trx, eventId, "retour")).toEqual({ cars: 0, persons: 0 });
    });
  });
});

describe("deleteLegRows", () => {
  it("deletes the leg's Rides and Placements; the persons, the other leg and the other events stay", async () => {
    await withRollback(async (trx) => {
      const { eventId } = await seedScene(trx);
      const other = await seedScene(trx);
      const before = await rowsOf(trx, eventId);
      const otherBefore = await rowsOf(trx, other.eventId);
      const persons = await readTokenHolders(trx, eventId);

      await deleteLegRows(trx, eventId, "retour");

      const after = await rowsOf(trx, eventId);
      expect(after.rides).toEqual(before.rides.filter((ride) => ride.leg === "aller"));
      expect(after.placements).toEqual(before.placements.filter((placement) => placement.leg === "aller"));
      expect(await countLegRows(trx, eventId, "retour")).toEqual({ cars: 0, persons: 0 });
      expect(await readTokenHolders(trx, eventId)).toEqual(persons);
      expect(await rowsOf(trx, other.eventId)).toEqual(otherBefore);
    });
  });
});
