import { sql, type Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import {
  deletePlacement,
  dropPassengers,
  findPlacement,
  removePassengers,
  seatedOnLeg,
  setPlacement,
} from "./placements";
import type { Database } from "./schema";
import { atomically } from "./transaction";
import { withCommittedEvent } from "./test-committed";
import { withRollback } from "./test-db";
import { seedEvent } from "./test-events";
import { seedPerson, seedRide } from "./test-participants";

async function placementsOf(trx: Kysely<Database>, eventId: string) {
  return trx
    .selectFrom("placement")
    .select(["person_id", "leg", "ride_id", "placed_at"])
    .where("event_id", "=", eventId)
    .orderBy("person_id")
    .orderBy("leg")
    .execute();
}

/** Within one transaction now() does not move: an earlier boarding is written by hand. */
async function boardedEarlier(trx: Kysely<Database>, personId: string) {
  await sql`update placement set placed_at = now() - interval '1 hour' where person_id = ${personId}`.execute(trx);
}

async function now(trx: Kysely<Database>): Promise<Date> {
  const { rows } = await sql<{ now: Date }>`select now() as now`.execute(trx);
  return rows[0].now;
}

/** An event with two drivers on the aller, one on the retour, and a passenger. */
async function aCrowd(trx: Kysely<Database>) {
  const { id: eventId } = await seedEvent(trx);
  const drivers = [(await seedPerson(trx, eventId)).id, (await seedPerson(trx, eventId)).id];
  const rideA = await seedRide(trx, eventId, drivers[0], { leg: "aller" });
  const rideB = await seedRide(trx, eventId, drivers[1], { leg: "aller" });
  const rideRetour = await seedRide(trx, eventId, drivers[0], { leg: "retour" });
  const { id: personId } = await seedPerson(trx, eventId);
  return { eventId, rideA, rideB, rideRetour, personId };
}

describe("setPlacement", () => {
  it("writes the person's Placement on the leg, once, and keeps its boarding time when nothing changes", async () => {
    await withRollback(async (trx) => {
      const { eventId, rideA, personId } = await aCrowd(trx);
      await setPlacement(trx, { personId, eventId, leg: "aller", rideId: rideA });
      await boardedEarlier(trx, personId);
      const [before] = await placementsOf(trx, eventId);
      await setPlacement(trx, { personId, eventId, leg: "aller", rideId: rideA });
      expect(await placementsOf(trx, eventId)).toEqual([before]);
      expect(before).toMatchObject({ person_id: personId, leg: "aller", ride_id: rideA });
    });
  });

  it("sets the boarding time back to now() when the ride changes, to another car or to none", async () => {
    await withRollback(async (trx) => {
      const { eventId, rideA, rideB, personId } = await aCrowd(trx);
      await setPlacement(trx, { personId, eventId, leg: "aller", rideId: rideA });

      await boardedEarlier(trx, personId);
      await setPlacement(trx, { personId, eventId, leg: "aller", rideId: rideB });
      expect(await placementsOf(trx, eventId)).toEqual([
        { person_id: personId, leg: "aller", ride_id: rideB, placed_at: await now(trx) },
      ]);

      await boardedEarlier(trx, personId);
      await setPlacement(trx, { personId, eventId, leg: "aller", rideId: null });
      expect(await placementsOf(trx, eventId)).toEqual([
        { person_id: personId, leg: "aller", ride_id: null, placed_at: await now(trx) },
      ]);
    });
  });

  it("leaves the other leg as it was (C3.5)", async () => {
    await withRollback(async (trx) => {
      const { eventId, rideA, rideB, rideRetour, personId } = await aCrowd(trx);
      await setPlacement(trx, { personId, eventId, leg: "retour", rideId: rideRetour });
      await boardedEarlier(trx, personId);
      const [retour] = await placementsOf(trx, eventId);
      await setPlacement(trx, { personId, eventId, leg: "aller", rideId: rideA });
      await setPlacement(trx, { personId, eventId, leg: "aller", rideId: rideB });
      const rows = await placementsOf(trx, eventId);
      expect(rows).toHaveLength(2);
      expect(rows.find((row) => row.leg === "retour")).toEqual(retour);
    });
  });

  it("leaves a person of another event as she is", async () => {
    await withRollback(async (trx) => {
      const { eventId, rideA, personId } = await aCrowd(trx);
      const { id: otherId } = await seedEvent(trx);
      await setPlacement(trx, { personId, eventId, leg: "aller", rideId: rideA });
      const before = await placementsOf(trx, eventId);
      await setPlacement(trx, { personId, eventId: otherId, leg: "aller", rideId: null });
      expect(await placementsOf(trx, eventId)).toEqual(before);
      expect(await placementsOf(trx, otherId)).toEqual([]);
    });
  });

  // The order is Ride, then Person: the trigger on placement locks the Person, so the Ride
  // must already be held FOR UPDATE, a lock that stops a FOR KEY SHARE from elsewhere.
  it("takes its Ride FOR UPDATE first, when it writes one", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const { id: driverId } = await seedPerson(db, eventId);
      const { id: personId } = await seedPerson(db, eventId);
      const rideId = await seedRide(db, eventId, driverId);
      const keyShare = () => sql`select id from ride where id = ${rideId} for key share nowait`.execute(db);
      await atomically(db, async (trx) => {
        await setPlacement(trx, { personId, eventId, leg: "aller", rideId });
        await expect(keyShare()).rejects.toMatchObject({ code: "55P03" });
      });
      await expect(keyShare()).resolves.toBeDefined();
    });
  });
});

describe("deletePlacement", () => {
  it("removes the person's Placement on that leg only", async () => {
    await withRollback(async (trx) => {
      const { eventId, rideA, personId } = await aCrowd(trx);
      await setPlacement(trx, { personId, eventId, leg: "aller", rideId: rideA });
      await setPlacement(trx, { personId, eventId, leg: "retour", rideId: null });
      const { id: otherId } = await seedEvent(trx);
      expect(await deletePlacement(trx, { personId, eventId: otherId, leg: "aller" })).toBe(false);
      expect(await placementsOf(trx, eventId)).toHaveLength(2);
      expect(await deletePlacement(trx, { personId, eventId, leg: "aller" })).toBe(true);
      expect(await deletePlacement(trx, { personId, eventId, leg: "aller" })).toBe(false);
      expect(await placementsOf(trx, eventId)).toEqual([
        expect.objectContaining({ person_id: personId, leg: "retour", ride_id: null }),
      ]);
    });
  });
});

describe("removePassengers", () => {
  it("leaves the persons given without a car on the ride's leg, boarding time now(), and no one else", async () => {
    await withRollback(async (trx) => {
      const { eventId, rideA, rideRetour, personId } = await aCrowd(trx);
      const { id: stays } = await seedPerson(trx, eventId);
      await setPlacement(trx, { personId, eventId, leg: "aller", rideId: rideA });
      await setPlacement(trx, { personId: stays, eventId, leg: "aller", rideId: rideA });
      await setPlacement(trx, { personId, eventId, leg: "retour", rideId: rideRetour });
      await boardedEarlier(trx, personId);
      await boardedEarlier(trx, stays);
      const before = await placementsOf(trx, eventId);

      const removed = await removePassengers(trx, { id: rideA, eventId, leg: "aller" }, [personId]);
      expect(removed).toEqual([personId]);
      const after = await placementsOf(trx, eventId);
      const row = (id: string, leg: string) => after.find((p) => p.person_id === id && p.leg === leg);
      expect(row(personId, "aller")).toEqual({ person_id: personId, leg: "aller", ride_id: null, placed_at: await now(trx) });
      expect(row(personId, "retour")).toEqual(before.find((p) => p.person_id === personId && p.leg === "retour"));
      expect(row(stays, "aller")).toEqual(before.find((p) => p.person_id === stays));
    });
  });

  it("takes the Ride FOR UPDATE first", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const { id: driverId } = await seedPerson(db, eventId);
      const { id: personId } = await seedPerson(db, eventId);
      const rideId = await seedRide(db, eventId, driverId);
      await setPlacement(db, { personId, eventId, leg: "aller", rideId });
      const keyShare = () => sql`select id from ride where id = ${rideId} for key share nowait`.execute(db);
      await atomically(db, async (trx) => {
        await removePassengers(trx, { id: rideId, eventId, leg: "aller" }, [personId]);
        await expect(keyShare()).rejects.toMatchObject({ code: "55P03" });
      });
    });
  });

  it("removes nobody through another event", async () => {
    await withRollback(async (trx) => {
      const { eventId, rideA, personId } = await aCrowd(trx);
      const { id: otherId } = await seedEvent(trx);
      await setPlacement(trx, { personId, eventId, leg: "aller", rideId: rideA });
      const before = await placementsOf(trx, eventId);
      expect(await removePassengers(trx, { id: rideA, eventId: otherId, leg: "aller" }, [personId])).toEqual([]);
      expect(await placementsOf(trx, eventId)).toEqual(before);
    });
  });

  it("removes nobody for an empty list, or from another leg", async () => {
    await withRollback(async (trx) => {
      const { eventId, rideA, personId } = await aCrowd(trx);
      await setPlacement(trx, { personId, eventId, leg: "aller", rideId: rideA });
      expect(await removePassengers(trx, { id: rideA, eventId, leg: "aller" }, [])).toEqual([]);
      expect(await removePassengers(trx, { id: rideA, eventId, leg: "retour" }, [personId])).toEqual([]);
      expect(await placementsOf(trx, eventId)).toEqual([expect.objectContaining({ ride_id: rideA })]);
    });
  });
});

describe("dropPassengers", () => {
  it("deletes the Placement of the persons given who are in the Ride, on its leg only, and no one else's", async () => {
    await withRollback(async (trx) => {
      const { eventId, rideA, rideB, rideRetour, personId } = await aCrowd(trx);
      const { id: stays } = await seedPerson(trx, eventId);
      const { id: elsewhere } = await seedPerson(trx, eventId);
      const { id: withoutCar } = await seedPerson(trx, eventId);
      await setPlacement(trx, { personId, eventId, leg: "aller", rideId: rideA });
      await setPlacement(trx, { personId, eventId, leg: "retour", rideId: rideRetour });
      await setPlacement(trx, { personId: stays, eventId, leg: "aller", rideId: rideA });
      await setPlacement(trx, { personId: elsewhere, eventId, leg: "aller", rideId: rideB });
      await setPlacement(trx, { personId: withoutCar, eventId, leg: "aller", rideId: null });
      const before = await placementsOf(trx, eventId);

      const dropped = await dropPassengers(trx, { id: rideA, eventId, leg: "aller" }, [personId, elsewhere, withoutCar]);

      expect(dropped).toEqual([personId]);
      const gone = (row: (typeof before)[number]) => row.person_id === personId && row.leg === "aller";
      expect(await placementsOf(trx, eventId)).toEqual(before.filter((row) => !gone(row)));
    });
  });

  it("deletes nothing for an empty list, from another leg, or through another event", async () => {
    await withRollback(async (trx) => {
      const { eventId, rideA, personId } = await aCrowd(trx);
      const { id: otherId } = await seedEvent(trx);
      await setPlacement(trx, { personId, eventId, leg: "aller", rideId: rideA });
      const before = await placementsOf(trx, eventId);
      expect(await dropPassengers(trx, { id: rideA, eventId, leg: "aller" }, [])).toEqual([]);
      expect(await dropPassengers(trx, { id: rideA, eventId, leg: "retour" }, [personId])).toEqual([]);
      expect(await dropPassengers(trx, { id: rideA, eventId: otherId, leg: "aller" }, [personId])).toEqual([]);
      expect(await placementsOf(trx, eventId)).toEqual(before);
    });
  });

  it("takes the Ride FOR UPDATE first", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const { id: driverId } = await seedPerson(db, eventId);
      const { id: personId } = await seedPerson(db, eventId);
      const rideId = await seedRide(db, eventId, driverId);
      await setPlacement(db, { personId, eventId, leg: "aller", rideId });
      const keyShare = () => sql`select id from ride where id = ${rideId} for key share nowait`.execute(db);
      await atomically(db, async (trx) => {
        await dropPassengers(trx, { id: rideId, eventId, leg: "aller" }, [personId]);
        await expect(keyShare()).rejects.toMatchObject({ code: "55P03" });
      });
    });
  });
});

describe("seatedOnLeg", () => {
  it("lists the leg's drivers and passengers, not those without a car, nor the other leg or event", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const ids: string[] = [];
      for (const firstName of ["Marc", "Zoé", "Léa", "Tom", "Max"]) ids.push((await seedPerson(trx, eventId, { firstName })).id);
      const [marc, zoe, lea, tom, max] = ids;
      const rideMarc = await seedRide(trx, eventId, marc, { leg: "aller" });
      await seedRide(trx, eventId, zoe, { leg: "aller" });
      const rideRetour = await seedRide(trx, eventId, marc, { leg: "retour" });
      await setPlacement(trx, { personId: lea, eventId, leg: "aller", rideId: rideMarc });
      await setPlacement(trx, { personId: tom, eventId, leg: "aller", rideId: null });
      await setPlacement(trx, { personId: max, eventId, leg: "retour", rideId: rideRetour });
      const other = await aCrowd(trx);
      await setPlacement(trx, { personId: other.personId, eventId: other.eventId, leg: "aller", rideId: other.rideA });

      expect((await seatedOnLeg(trx, eventId, "aller")).sort()).toEqual([marc, zoe, lea].sort());
      expect((await seatedOnLeg(trx, eventId, "retour")).sort()).toEqual([marc, max].sort());
    });
  });
});

describe("findPlacement", () => {
  it("gives where the person stands on that leg only, in that event only", async () => {
    await withRollback(async (trx) => {
      const { eventId, rideA, personId } = await aCrowd(trx);
      const { id: otherId } = await seedEvent(trx);
      await setPlacement(trx, { personId, eventId, leg: "aller", rideId: rideA });
      expect(await findPlacement(trx, { personId, eventId, leg: "aller" })).toEqual({ rideId: rideA });
      expect(await findPlacement(trx, { personId, eventId, leg: "retour" })).toBeUndefined();
      expect(await findPlacement(trx, { personId, eventId: otherId, leg: "aller" })).toBeUndefined();
      await setPlacement(trx, { personId, eventId, leg: "aller", rideId: null });
      expect(await findPlacement(trx, { personId, eventId, leg: "aller" })).toEqual({ rideId: null });
    });
  });
});
