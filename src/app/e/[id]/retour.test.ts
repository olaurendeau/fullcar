import { randomBytes, randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { findEventById, lockEvent, writeEventFields } from "@/db/events";
import { countLegRows, type LegCounts } from "@/db/legs";
import { readTokenHolders } from "@/db/persons";
import type { Database } from "@/db/schema";
import { whileHeld, withCommittedEvent } from "@/db/test-committed";
import { withRollback } from "@/db/test-db";
import { seedEvent } from "@/db/test-events";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { atomically } from "@/db/transaction";
import { PERSONAL_TOKEN_BYTES, personalTokenFromBytes } from "@/domain/personal-token";
import { offerRide } from "./offer-ride";
import { addPerson, setPersonLeg } from "./persons";
import { removeRetour } from "./retour";
import { takeSeats } from "./seats";

type Db = Kysely<Database>;

/**
 * Aller: Marc drives Léa (r1), Tom is without a car. Retour: Marc drives Léa (r3, 3 seats),
 * Zoé drives nobody (r4). Tom is not concerned by the retour. Each has their own device.
 * The retour counts 2 cars and 3 persons.
 */
async function seedScene(db: Db, eventId: string) {
  const marc = await seedPerson(db, eventId, { firstName: "Marc" });
  const lea = await seedPerson(db, eventId, { firstName: "Léa" });
  const tom = await seedPerson(db, eventId, { firstName: "Tom" });
  const zoe = await seedPerson(db, eventId, { firstName: "Zoé" });
  const r1 = await seedRide(db, eventId, marc.id, { leg: "aller" });
  const r3 = await seedRide(db, eventId, marc.id, { leg: "retour" });
  const r4 = await seedRide(db, eventId, zoe.id, { leg: "retour" });
  await seedPlacement(db, { personId: lea.id, eventId, leg: "aller", rideId: r1 });
  await seedPlacement(db, { personId: tom.id, eventId, leg: "aller", rideId: null });
  await seedPlacement(db, { personId: lea.id, eventId, leg: "retour", rideId: r3 });
  return { marc, lea, tom, zoe, r1, r3, r4 };
}

const SEEN: LegCounts = { cars: 2, persons: 3 };

/** The rides and Placements of the event, and its persons. */
async function rowsOf(db: Db, eventId: string) {
  const rides = await db.selectFrom("ride").select(["id", "leg"]).where("event_id", "=", eventId).orderBy("id").execute();
  const placements = await db
    .selectFrom("placement")
    .select(["person_id", "leg", "ride_id", "placed_at"])
    .where("event_id", "=", eventId)
    .orderBy("person_id")
    .orderBy("leg")
    .execute();
  const persons = (await readTokenHolders(db, eventId)).map((holder) => holder.id).sort();
  return { rides, placements, persons };
}

/** Removes the retour as updateEvent does: the Event locked, the retour emptied, then `retour_at` null, in one transaction. */
async function removal(db: Db, eventId: string, confirmed?: LegCounts) {
  return atomically(db, async (trx) => {
    const event = await lockEvent(trx, eventId, "noKeyUpdate");
    if (event === undefined) throw new Error("no event");
    const removed = await removeRetour(trx, eventId, confirmed);
    const { title, location, aller_at: allerAt } = event;
    if (removed.ok) await writeEventFields(trx, eventId, { title, location, allerAt, retourAt: null });
    return removed;
  });
}

describe("removeRetour", () => {
  it("DE1 = (b): the numbers confirmed are still those: the retour's Rides and Placements go, the persons and the aller stay", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      await seedScene(trx, eventId);
      const before = await rowsOf(trx, eventId);

      expect(await removeRetour(trx, eventId, SEEN)).toEqual({ ok: true });

      expect(await rowsOf(trx, eventId)).toEqual({
        rides: before.rides.filter((ride) => ride.leg === "aller"),
        placements: before.placements.filter((placement) => placement.leg === "aller"),
        persons: before.persons,
      });
    });
  });

  it("decision 35: a car swapped for another, the numbers the same, still removes the retour", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const { tom, r4 } = await seedScene(trx, eventId);
      await trx.deleteFrom("ride").where("id", "=", r4).execute();
      await seedRide(trx, eventId, tom.id, { leg: "retour" });
      // Zoé, no longer driving, is not on the retour: still 2 cars and 3 persons.

      expect(await removeRetour(trx, eventId, SEEN)).toEqual({ ok: true });
      expect(await countLegRows(trx, eventId, "retour")).toEqual({ cars: 0, persons: 0 });
    });
  });

  it("unconfirmed, or the numbers changed, gives the numbers now, and deletes nothing", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const { tom } = await seedScene(trx, eventId);
      const before = await rowsOf(trx, eventId);
      expect(await removeRetour(trx, eventId)).toEqual({ ok: false, error: "confirmRetour", ...SEEN });
      expect(await rowsOf(trx, eventId)).toEqual(before);

      await seedPlacement(trx, { personId: tom.id, eventId, leg: "retour", rideId: null });
      const changed = await rowsOf(trx, eventId);
      expect(await removeRetour(trx, eventId, SEEN)).toEqual({ ok: false, error: "confirmRetour", cars: 2, persons: 4 });
      expect(await rowsOf(trx, eventId)).toEqual(changed);
    });
  });

  it("an empty retour, or one emptied since the confirmation, is removed without asking", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      await seedPerson(trx, eventId);
      expect(await removeRetour(trx, eventId)).toEqual({ ok: true });
      expect(await removeRetour(trx, eventId, SEEN)).toEqual({ ok: true });
    });
  });
});

function newToken(): string {
  return personalTokenFromBytes(randomBytes(PERSONAL_TOKEN_BYTES));
}

/** Rows of the retour left under an event without a retour: what M3.6 forbids. */
async function hiddenRetourRows(db: Db, eventId: string) {
  const event = await findEventById(db, eventId);
  if (event?.retour_at !== null) return 0;
  const { cars, persons } = await countLegRows(db, eventId, "retour");
  return cars + persons;
}

type Scene = Awaited<ReturnType<typeof seedScene>>;

/** The four writes on the retour of M3.6, by Tom, and what they add to the retour's numbers. */
const WRITES: [string, LegCounts, (db: Db, eventId: string, scene: Scene) => Promise<unknown>][] = [
  [
    "a seat taken on the retour",
    { cars: 2, persons: 4 },
    (db, eventId, { tom, r3 }) => takeSeats(db, eventId, tom.token, r3, "retour", [tom.id]),
  ],
  [
    "« sans voiture » on the retour",
    { cars: 2, persons: 4 },
    (db, eventId, { tom }) => setPersonLeg(db, eventId, tom.token, { personId: tom.id, leg: "retour", kind: "withoutCar" }),
  ],
  [
    "a car offered on the retour",
    { cars: 3, persons: 4 },
    (db, eventId, { tom }) =>
      offerRide(db, eventId, tom.token, {
        rideId: randomUUID(),
        leg: "retour",
        driver: { kind: "device", personId: tom.id },
        location: "Salle Paul Bert",
        time: "18:30",
        seats: "3",
        note: "",
      }),
  ],
  [
    "a person added « Aller et retour »",
    { cars: 2, persons: 4 },
    (db, eventId) =>
      addPerson(db, eventId, newToken(), { id: randomUUID(), firstName: "Inès", phone: "", bothLegs: true, leg: "aller" }),
  ],
];

describe("M3.6: the removal of the retour and a write on the retour, at the same time, on committed data", () => {
  it.each(WRITES)("%s first: the removal waits for it, then finds other numbers and removes nothing", async (_, after, write) => {
    await withCommittedEvent(async (db, eventId) => {
      const scene = await seedScene(db, eventId);

      const removed = await whileHeld(
        db,
        (trx) => write(trx, eventId, scene),
        () => removal(db, eventId, SEEN),
      );

      expect(removed).toEqual({ ok: false, error: "confirmRetour", ...after });
      expect((await findEventById(db, eventId))?.retour_at).not.toBeNull();
      expect(await countLegRows(db, eventId, "retour")).toEqual(after);
    });
  });

  it.each(WRITES)("the removal first: %s waits for it, then is refused by noRetour", async (_, __, write) => {
    await withCommittedEvent(async (db, eventId) => {
      const scene = await seedScene(db, eventId);

      const written = await whileHeld(
        db,
        (trx) => removal(trx, eventId, SEEN),
        () => write(db, eventId, scene),
      );

      expect(written).toMatchObject({ ok: false, error: "noRetour" });
      expect((await findEventById(db, eventId))?.retour_at).toBeNull();
      expect(await hiddenRetourRows(db, eventId)).toBe(0);
    });
  });
});
