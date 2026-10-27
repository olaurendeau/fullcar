import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { readEventRows } from "./event-rows";
import type { Database } from "./schema";
import { withRollback } from "./test-db";
import { seedEvent } from "./test-events";
import { seedStop } from "./test-participants";

type Db = Kysely<Database>;

async function addPerson(db: Db, eventId: string, firstName: string, phone: string | null = null) {
  const id = randomUUID();
  await db
    .insertInto("person")
    .values({ id, event_id: eventId, first_name: firstName, phone, token_hash: Buffer.alloc(32, 7) })
    .execute();
  return id;
}

async function addRide(
  db: Db,
  eventId: string,
  driverId: string,
  leg: "aller" | "retour",
  note: string | null = null,
  position: { lat: number; lng: number } | null = null,
) {
  const id = randomUUID();
  await db
    .insertInto("ride")
    .values({
      id,
      event_id: eventId,
      leg,
      driver_id: driverId,
      location: "Mairie de Cesson",
      departure_time: "07:15:00",
      seats: 3,
      note,
      location_lat: position?.lat ?? null,
      location_lng: position?.lng ?? null,
    })
    .execute();
  return id;
}

async function place(db: Db, eventId: string, personId: string, leg: "aller" | "retour", rideId: string | null) {
  await db.insertInto("placement").values({ person_id: personId, event_id: eventId, leg, ride_id: rideId }).execute();
}

describe("readEventRows", () => {
  it("reads the persons, rides and Placements of the event, the phones apart", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const driverId = await addPerson(trx, eventId, "Léa", "06 12 34 56 78");
      const passengerId = await addPerson(trx, eventId, "Paul");
      const rideId = await addRide(trx, eventId, driverId, "retour", "Coffre plein");
      await place(trx, eventId, passengerId, "retour", rideId);
      await place(trx, eventId, passengerId, "aller", null);
      const { rows } = await sql<{ now: Date }>`select now() as now`.execute(trx);

      const read = await readEventRows(trx, eventId, { stops: false });
      expect(read.persons).toHaveLength(2);
      expect(read.persons).toEqual(
        expect.arrayContaining([
          { id: driverId, firstName: "Léa" },
          { id: passengerId, firstName: "Paul" },
        ]),
      );
      expect(read.rides).toEqual([
        {
          id: rideId,
          leg: "retour",
          driverId,
          location: "Mairie de Cesson",
          departureTime: "07:15:00",
          seats: 3,
          note: "Coffre plein",
          position: null,
        },
      ]);
      expect(read.placements).toHaveLength(2);
      expect(read.placements).toEqual(
        expect.arrayContaining([
          { personId: passengerId, leg: "retour", rideId, stopId: null, placedAt: rows[0].now },
          { personId: passengerId, leg: "aller", rideId: null, stopId: null, placedAt: rows[0].now },
        ]),
      );
      expect(read.phonesById).toEqual(
        new Map([
          [driverId, "06 12 34 56 78"],
          [passengerId, null],
        ]),
      );
    });
  });

  it("reads a ride's position, or null when it has none", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const leaId = await addPerson(trx, eventId, "Léa");
      const paulId = await addPerson(trx, eventId, "Paul");
      const placedId = await addRide(trx, eventId, leaId, "aller", null, { lat: 48.56123, lng: -2.60071 });
      const unplacedId = await addRide(trx, eventId, paulId, "aller");

      const { rides } = await readEventRows(trx, eventId, { stops: false });
      expect(rides.map((ride) => [ride.id, ride.position])).toStrictEqual(
        expect.arrayContaining([
          [placedId, { lat: 48.56123, lng: -2.60071 }],
          [unplacedId, null],
        ]),
      );
      expect(rides).toHaveLength(2);
    });
  });

  it("reads nothing of another event", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const { id: otherId } = await seedEvent(trx);
      const driverId = await addPerson(trx, otherId, "Léa", "0612345678");
      const passengerId = await addPerson(trx, otherId, "Paul");
      const rideId = await addRide(trx, otherId, driverId, "aller");
      await place(trx, otherId, passengerId, "aller", rideId);

      expect(await readEventRows(trx, eventId, { stops: true })).toEqual({
        persons: [],
        rides: [],
        placements: [],
        stops: [],
        phonesById: new Map(),
      });
    });
  });

  describe("the Stops (RV8.3)", () => {
    async function seedBoarding(trx: Db) {
      const { id: eventId } = await seedEvent(trx, { stopsEnabled: true });
      const driverId = await addPerson(trx, eventId, "Léa");
      const passengerId = await addPerson(trx, eventId, "Paul");
      const rideId = await addRide(trx, eventId, driverId, "aller");
      const hereId = await seedStop(trx, eventId, rideId, { location: "Mairie de Pacé", time: "07:30:00" });
      const placedId = await seedStop(trx, eventId, rideId, {
        location: "Gare",
        time: "07:20:00",
        position: { lat: 48.1, lng: -1.7 },
      });
      await trx
        .insertInto("placement")
        .values({ person_id: passengerId, event_id: eventId, leg: "aller", ride_id: rideId, stop_id: placedId })
        .execute();
      return { eventId, rideId, passengerId, hereId, placedId };
    }

    it("with the option off, reads no Stop and no stopId, even when rows exist", async () => {
      await withRollback(async (trx) => {
        const { eventId, rideId } = await seedBoarding(trx);

        const read = await readEventRows(trx, eventId, { stops: false });

        expect(read.stops).toEqual([]);
        expect(read.placements).toHaveLength(1);
        expect(read.placements[0]).toMatchObject({ rideId, stopId: null });
      });
    });

    it("with the option on, reads the Stops by time then rank, their position, and the boarding stop", async () => {
      await withRollback(async (trx) => {
        const { eventId, rideId, hereId, placedId } = await seedBoarding(trx);

        const read = await readEventRows(trx, eventId, { stops: true });

        expect(read.stops).toEqual([
          { id: placedId, rideId, location: "Gare", time: "07:20:00", position: { lat: 48.1, lng: -1.7 } },
          { id: hereId, rideId, location: "Mairie de Pacé", time: "07:30:00", position: null },
        ]);
        expect(read.placements[0]).toMatchObject({ rideId, stopId: placedId });
      });
    });

    it("reads two Stops at the same time by rank, whatever their ids (RV1.5)", async () => {
      await withRollback(async (trx) => {
        const { id: eventId } = await seedEvent(trx, { stopsEnabled: true });
        const driverId = await addPerson(trx, eventId, "Léa");
        const rideId = await addRide(trx, eventId, driverId, "aller");
        // The ids run against the ranks: ordered by id, the second Stop would come first.
        const firstId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
        const secondId = "00000000-0000-4000-8000-000000000000";
        await seedStop(trx, eventId, rideId, { id: secondId, location: "Gare", time: "07:20:00", rank: 1 });
        await seedStop(trx, eventId, rideId, { id: firstId, location: "Mairie de Pacé", time: "07:20:00", rank: 0 });

        const read = await readEventRows(trx, eventId, { stops: true });

        expect(read.stops.map((stop) => stop.id)).toEqual([firstId, secondId]);
      });
    });

    it("reads no Stop of another event", async () => {
      await withRollback(async (trx) => {
        const { eventId } = await seedBoarding(trx);
        const { id: otherId } = await seedEvent(trx, { stopsEnabled: true });

        expect((await readEventRows(trx, otherId, { stops: true })).stops).toEqual([]);
        expect((await readEventRows(trx, eventId, { stops: true })).stops).toHaveLength(2);
      });
    });
  });
});
