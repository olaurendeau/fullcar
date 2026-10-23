import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { readEventRows } from "./event-rows";
import type { Database } from "./schema";
import { withRollback } from "./test-db";
import { seedEvent } from "./test-events";

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

      const read = await readEventRows(trx, eventId);
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
          { personId: passengerId, leg: "retour", rideId, placedAt: rows[0].now },
          { personId: passengerId, leg: "aller", rideId: null, placedAt: rows[0].now },
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

      const { rides } = await readEventRows(trx, eventId);
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

      expect(await readEventRows(trx, eventId)).toEqual({
        persons: [],
        rides: [],
        placements: [],
        phonesById: new Map(),
      });
    });
  });
});
