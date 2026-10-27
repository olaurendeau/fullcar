import { randomBytes, randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { anonymiseEvent } from "@/db/day-thirty";
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
import { removeRide, updateRide } from "./change-ride";
import { offerRide } from "./offer-ride";
import { addPerson, setPersonLeg, updatePerson } from "./persons";
import { lockLegs, removeRetour } from "./retour";
import { takeSeats, undoSeats } from "./seats";

type Db = Kysely<Database>;

/**
 * Aller: Marc drives Léa (r1), Tom is without a car. Retour: Marc drives Léa (r3, 3 seats),
 * Zoé drives nobody (r4). Tom is not concerned by the retour. Each has their own device.
 * The retour counts 2 cars and 3 persons. Tom, who offers a car, has a number (v4.8).
 */
async function seedScene(db: Db, eventId: string) {
  const marc = await seedPerson(db, eventId, { firstName: "Marc" });
  const lea = await seedPerson(db, eventId, { firstName: "Léa" });
  const tom = await seedPerson(db, eventId, { firstName: "Tom", phone: "06 33 33 33 33" });
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
        (own) => removal(own, eventId, SEEN),
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
        (own) => write(own, eventId, scene),
      );

      expect(written).toMatchObject({ ok: false, error: "noRetour" });
      expect((await findEventById(db, eventId))?.retour_at).toBeNull();
      expect(await hiddenRetourRows(db, eventId)).toBe(0);
    });
  });
});

/** The other writes on the legs, by the persons of the scene: with the four above, every one that starts with `lockLegs`. */
const OTHER_WRITES: [string, (db: Db, eventId: string, scene: Scene) => Promise<unknown>][] = [
  ["a seat given back", (db, eventId, { lea, r1 }) => undoSeats(db, eventId, lea.token, r1, "aller", [{ personId: lea.id, before: "withoutCar" }])],
  ["a person changed", (db, eventId, { lea }) => updatePerson(db, eventId, lea.token, { personId: lea.id, firstName: "Léonie", phone: "" })],
  [
    "a car changed",
    (db, eventId, { marc, r1 }) =>
      updateRide(db, eventId, marc.token, r1, "aller", { location: "Mairie de Cesson", time: "07:15", seats: "4", note: "", seenPassengerIds: [], leaving: [] }),
  ],
  ["a car removed", (db, eventId, { marc, r1 }) => removeRide(db, eventId, marc.token, r1, "aller")],
];

/** Anonymises the event as the purge does on day 30: under the Event's exclusive lock. */
async function anonymisation(db: Db, eventId: string) {
  await atomically(db, async (trx) => {
    await lockEvent(trx, eventId, "noKeyUpdate");
    await anonymiseEvent(trx, eventId);
  });
}

describe("eventEnded: a write on an anonymised event (#588)", () => {
  it("lockLegs refuses it, after eventNotFound and before noRetour", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx, { retourAt: null });
      expect(await lockLegs(trx, eventId, ["retour"])).toEqual({ ok: false, error: "noRetour" });
      await anonymiseEvent(trx, eventId);
      expect(await lockLegs(trx, eventId, ["retour"])).toEqual({ ok: false, error: "eventEnded" });
      expect(await lockLegs(trx, eventId, [])).toEqual({ ok: false, error: "eventEnded" });
      expect(await lockLegs(trx, "Zz9yXw8v", [])).toEqual({ ok: false, error: "eventNotFound" });
    });
  });

  it.each([...WRITES.map(([name, , write]) => [name, write] as const), ...OTHER_WRITES])(
    "%s is refused by eventEnded, and nothing is written",
    async (_, write) => {
      await withRollback(async (trx) => {
        const { id: eventId } = await seedEvent(trx);
        const scene = await seedScene(trx, eventId);
        // The tokens of the scene stay with the test; their persons are gone with the rest.
        await anonymiseEvent(trx, eventId);

        expect(await write(trx, eventId, scene)).toMatchObject({ ok: false, error: "eventEnded" });
        expect(await rowsOf(trx, eventId)).toEqual({ rides: [], placements: [], persons: [] });
      });
    },
  );

  it.each(WRITES)("the anonymisation first: %s waits for it, then is refused by eventEnded (committed data)", async (_, __, write) => {
    await withCommittedEvent(async (db, eventId) => {
      const scene = await seedScene(db, eventId);

      const written = await whileHeld(
        db,
        (trx) => anonymisation(trx, eventId),
        (own) => write(own, eventId, scene),
      );

      expect(written).toMatchObject({ ok: false, error: "eventEnded" });
      expect(await rowsOf(db, eventId)).toEqual({ rides: [], placements: [], persons: [] });
    });
  });
});
