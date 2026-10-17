import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { deleteRide, insertRide, lockRide, ridePassengers, updateRide, type NewRide } from "./rides";
import type { Database } from "./schema";
import { atomically } from "./transaction";
import { withCommittedEvent } from "./test-committed";
import { withRollback } from "./test-db";
import { seedEvent } from "./test-events";
import { seedPerson, seedPlacement, seedRide } from "./test-participants";

function aRide(eventId: string, driverId: string, fields: Partial<NewRide> = {}): NewRide {
  return {
    id: randomUUID(),
    eventId,
    leg: "aller",
    driverId,
    location: "Mairie de Cesson",
    departureTime: "07:15:00",
    seats: 3,
    note: null,
    ...fields,
  };
}

async function ridesOf(trx: Kysely<Database>, eventId: string) {
  return trx
    .selectFrom("ride")
    .select(["id", "leg", "driver_id", "location", "departure_time", "seats", "note"])
    .where("event_id", "=", eventId)
    .orderBy("leg")
    .execute();
}

describe("insertRide", () => {
  it("inserts the same id once, and returns the ride already stored", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const { id: driverId } = await seedPerson(trx, eventId);
      const ride = aRide(eventId, driverId, { note: "Coffre plein" });
      expect(await insertRide(trx, ride)).toEqual(ride);
      expect(await insertRide(trx, { ...ride, location: "Ailleurs", seats: 8 })).toEqual(ride);
      const { id, leg, location, departureTime: departure_time, seats, note } = ride;
      expect(await ridesOf(trx, eventId)).toEqual([{ id, leg, driver_id: driverId, location, departure_time, seats, note }]);
    });
  });

  it("returns nothing when the id is held on the other leg, and writes nothing", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const { id: driverId } = await seedPerson(trx, eventId);
      const ride = aRide(eventId, driverId);
      await insertRide(trx, ride);
      expect(await insertRide(trx, { ...ride, leg: "retour" })).toBeUndefined();
      expect(await ridesOf(trx, eventId)).toEqual([expect.objectContaining({ id: ride.id, leg: "aller" })]);
    });
  });

  it("returns nothing of the other event holding the id, and writes nothing", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const { id: otherId } = await seedEvent(trx);
      const { id: driverId } = await seedPerson(trx, eventId);
      const { id: otherDriverId } = await seedPerson(trx, otherId);
      const ride = aRide(eventId, driverId);
      await insertRide(trx, ride);
      expect(await insertRide(trx, aRide(otherId, otherDriverId, { id: ride.id }))).toBeUndefined();
      expect(await ridesOf(trx, otherId)).toEqual([]);
      expect(await ridesOf(trx, eventId)).toEqual([expect.objectContaining({ id: ride.id, driver_id: driverId })]);
    });
  });
});

/** A Ride of one event with a passenger, and another event naming it: what a stranger's request would send. */
async function aRideAndAStranger(trx: Kysely<Database>) {
  const { id: eventId } = await seedEvent(trx);
  const { id: otherId } = await seedEvent(trx);
  const { id: driverId } = await seedPerson(trx, eventId);
  const { id: passengerId } = await seedPerson(trx, eventId);
  const id = await seedRide(trx, eventId, driverId);
  await seedPlacement(trx, { personId: passengerId, eventId, leg: "aller", rideId: id });
  return { eventId, id, stranger: { id, eventId: otherId, leg: "aller" as const } };
}

describe("a Ride named with another event", () => {
  it("is not locked", async () => {
    await withRollback(async (trx) => {
      const { stranger } = await aRideAndAStranger(trx);
      expect(await lockRide(trx, stranger)).toBeUndefined();
    });
  });

  it("is not changed", async () => {
    await withRollback(async (trx) => {
      const { eventId, stranger } = await aRideAndAStranger(trx);
      const before = await ridesOf(trx, eventId);
      const changes = { location: "Gare", departureTime: "18:30:00", seats: 1, note: null };
      expect(await updateRide(trx, stranger, changes)).toBe(false);
      expect(await ridesOf(trx, eventId)).toEqual(before);
    });
  });

  it("has no passengers listed", async () => {
    await withRollback(async (trx) => {
      const { eventId, id, stranger } = await aRideAndAStranger(trx);
      expect(await ridePassengers(trx, { id, eventId, leg: "aller" })).toHaveLength(1);
      expect(await ridePassengers(trx, stranger)).toEqual([]);
    });
  });

  it("is not deleted", async () => {
    await withRollback(async (trx) => {
      const { eventId, id, stranger } = await aRideAndAStranger(trx);
      expect(await deleteRide(trx, stranger)).toBe(false);
      expect(await ridesOf(trx, eventId)).toEqual([expect.objectContaining({ id })]);
    });
  });
});

describe("lockRide", () => {
  it("returns the ride's seats and driver, and nothing for an unknown ride or another leg", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const { id: driverId } = await seedPerson(trx, eventId);
      const id = await seedRide(trx, eventId, driverId, { seats: 4 });
      expect(await lockRide(trx, { id, eventId, leg: "aller" })).toEqual({ id, driverId, seats: 4 });
      expect(await lockRide(trx, { id, eventId, leg: "retour" })).toBeUndefined();
      expect(await lockRide(trx, { id: randomUUID(), eventId, leg: "aller" })).toBeUndefined();
    });
  });

  // FOR UPDATE, not a weaker lock: only FOR UPDATE stops the FOR KEY SHARE that a
  // placement's foreign key takes on its ride.
  it("holds the ride FOR UPDATE until the transaction ends", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const { id: driverId } = await seedPerson(db, eventId);
      const id = await seedRide(db, eventId, driverId);
      const keyShare = () => sql`select id from ride where id = ${id} for key share nowait`.execute(db);
      await atomically(db, async (trx) => {
        await lockRide(trx, { id, eventId, leg: "aller" });
        await expect(keyShare()).rejects.toMatchObject({ code: "55P03" });
      });
      await expect(keyShare()).resolves.toBeDefined();
    });
  });
});

describe("updateRide", () => {
  it("changes the ride on its leg only", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const { id: driverId } = await seedPerson(trx, eventId);
      const aller = await seedRide(trx, eventId, driverId, { leg: "aller" });
      const retour = await seedRide(trx, eventId, driverId, { leg: "retour" });
      const changes = { location: "Gare", departureTime: "18:30:00", seats: 2, note: "Pas de bagages" };
      expect(await updateRide(trx, { id: aller, eventId, leg: "aller" }, changes)).toBe(true);
      expect(await updateRide(trx, { id: retour, eventId, leg: "aller" }, changes)).toBe(false);
      const [stored, untouched] = await ridesOf(trx, eventId);
      expect(stored).toMatchObject({ id: aller, location: "Gare", departure_time: "18:30:00", seats: 2, note: "Pas de bagages" });
      expect(untouched).toMatchObject({ id: retour, location: "Mairie de Cesson", departure_time: "07:15:00", seats: 3 });
    });
  });
});

describe("deleteRide", () => {
  it("deletes the ride of that leg, and its passengers are left without a car", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const { id: driverId } = await seedPerson(trx, eventId);
      const { id: passengerId } = await seedPerson(trx, eventId);
      const id = await seedRide(trx, eventId, driverId);
      await seedPlacement(trx, { personId: passengerId, eventId, leg: "aller", rideId: id });
      expect(await deleteRide(trx, { id, eventId, leg: "retour" })).toBe(false);
      expect(await deleteRide(trx, { id, eventId, leg: "aller" })).toBe(true);
      expect(await ridesOf(trx, eventId)).toEqual([]);
      const placements = await trx
        .selectFrom("placement")
        .select(["person_id", "leg", "ride_id"])
        .where("event_id", "=", eventId)
        .execute();
      expect(placements).toEqual([{ person_id: passengerId, leg: "aller", ride_id: null }]);
    });
  });
});

describe("ridePassengers", () => {
  it("lists the passengers of the ride in boarding order, nobody else", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const { id: driverId } = await seedPerson(trx, eventId);
      const { id: otherDriverId } = await seedPerson(trx, eventId);
      const [first, second, elsewhere, without] = await Promise.all(
        [0, 1, 2, 3].map(async () => (await seedPerson(trx, eventId)).id),
      );
      const id = await seedRide(trx, eventId, driverId);
      const otherId = await seedRide(trx, eventId, otherDriverId);
      await seedPlacement(trx, { personId: second, eventId, leg: "aller", rideId: id });
      await seedPlacement(trx, { personId: first, eventId, leg: "aller", rideId: id });
      await seedPlacement(trx, { personId: elsewhere, eventId, leg: "aller", rideId: otherId });
      await seedPlacement(trx, { personId: without, eventId, leg: "aller", rideId: null });
      // now() is the same for the whole transaction: the order is set apart.
      await sql`update placement set placed_at = now() - interval '1 minute' where person_id = ${first}`.execute(trx);

      const passengers = await ridePassengers(trx, { id, eventId, leg: "aller" });
      expect(passengers.map((passenger) => passenger.personId)).toEqual([first, second]);
      expect(passengers[0].placedAt).toBeInstanceOf(Date);
      expect(await ridePassengers(trx, { id, eventId, leg: "retour" })).toEqual([]);
    });
  });
});
