import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { anonymiseEvent } from "@/db/day-thirty";
import { lockRide, ridePassengers } from "@/db/rides";
import type { Database } from "@/db/schema";
import { whileHeld, withCommittedEvent } from "@/db/test-committed";
import { withRollback } from "@/db/test-db";
import { seedEvent } from "@/db/test-events";
import { deleteSeededPerson, seedPerson, seedPlacement, seedRide, seedStop } from "@/db/test-participants";
import { atomically } from "@/db/transaction";
import { setBoardingStop } from "./boarding-stop";
import { readEventState, type EventState } from "./event-state";

type Db = Kysely<Database>;

/** A connection that fails the test as soon as anything reaches for it. */
const untouchable = new Proxy({} as Db, {
  get(_, property) {
    throw new Error(`the database was used (${String(property)})`);
  },
});

/** Well-formed (22 base64url characters, the last one canonical), and held by nobody. */
const NOBODYS_TOKEN = "AAAAAAAAAAAAAAAAAAAAAA";

/**
 * Aller: Marc drives r1 (3 seats) with two points, s1 at 07:10 and s2 at 07:20; Léa boards at
 * its start, Hugo at s1. Zoé drives r2, with a point s3, and Tom boards in it. Inès is
 * without a car. Léa, Hugo and Inès are the persons of one device; the others have their own.
 */
async function seedScene(db: Db) {
  // The option « Points de RDV » is on: the points of the scene are the event's (RV8.3).
  const { id: eventId } = await seedEvent(db, { stopsEnabled: true });
  const marc = await seedPerson(db, eventId, { firstName: "Marc" });
  const zoe = await seedPerson(db, eventId, { firstName: "Zoé" });
  const tom = await seedPerson(db, eventId, { firstName: "Tom" });
  const lea = await seedPerson(db, eventId, { firstName: "Léa" });
  const hugo = await seedPerson(db, eventId, { firstName: "Hugo" }, lea.token);
  const ines = await seedPerson(db, eventId, { firstName: "Inès" }, lea.token);
  const r1 = await seedRide(db, eventId, marc.id, { leg: "aller" });
  const r2 = await seedRide(db, eventId, zoe.id, { leg: "aller" });
  const s1 = await seedStop(db, eventId, r1, { location: "Mairie de Pacé", time: "07:10:00" });
  const s2 = await seedStop(db, eventId, r1, { location: "Gare de Rennes", time: "07:20:00" });
  const s3 = await seedStop(db, eventId, r2, { location: "Place de la Mairie", time: "07:15:00" });
  await seedPlacement(db, { personId: lea.id, eventId, leg: "aller", rideId: r1 });
  await seedPlacement(db, { personId: hugo.id, eventId, leg: "aller", rideId: r1, stopId: s1 });
  await seedPlacement(db, { personId: tom.id, eventId, leg: "aller", rideId: r2, stopId: s3 });
  await seedPlacement(db, { personId: ines.id, eventId, leg: "aller", rideId: null });
  return { eventId, marc, zoe, tom, lea, hugo, ines, r1, r2, s1, s2, s3 };
}

/** Every Placement of the aller, with the version of its row: a write that should not happen shows. */
async function rowsOf(db: Db, eventId: string) {
  const result = await sql<{ person_id: string; ride_id: string | null; stop_id: string | null; placed_at: Date; version: string }>`
    select person_id, ride_id, stop_id, placed_at, xmin::text as version
    from placement where event_id = ${eventId} and leg = 'aller' order by person_id`.execute(db);
  return result.rows;
}

/** The coverage as the page shows it: each car's seats, free seats and passengers, and who is without a car. */
async function boardOf(db: Db, eventId: string, token: string) {
  const state = (await readEventState(db, eventId, token)) as EventState;
  return state.legs.map((board) => ({
    leg: board.leg,
    cars: board.cars.map((car) => ({
      id: car.id,
      seats: car.seats,
      freeSeats: car.freeSeats,
      full: car.full,
      passengers: car.passengers.map((person) => person.id),
    })),
    withoutCar: board.withoutCar.map((person) => person.id),
  }));
}

/** What the organiser's write does to a Ride's Stop: the Ride's lock first, then the delete. */
async function removeStopUnderRide(db: Db, eventId: string, rideId: string, stopId: string): Promise<void> {
  await atomically(db, async (trx) => {
    await lockRide(trx, { id: rideId, eventId, leg: "aller" });
    await trx.deleteFrom("stop").where("id", "=", stopId).execute();
  });
}

describe("setBoardingStop", () => {
  it("RV4.2: moves from the start to a point, from a point to another, and from a point to the start", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, hugo, r1, s2 } = await seedScene(trx);
      const stopOf = async (personId: string) =>
        (await rowsOf(trx, eventId)).find((row) => row.person_id === personId)?.stop_id;

      const toPoint = await setBoardingStop(trx, eventId, lea.token, r1, lea.id, s2);
      expect(toPoint).toEqual({ ok: true, state: await readEventState(trx, eventId, lea.token) });
      expect(await stopOf(lea.id)).toBe(s2);

      expect(await setBoardingStop(trx, eventId, lea.token, r1, hugo.id, s2)).toMatchObject({ ok: true });
      expect(await stopOf(hugo.id)).toBe(s2);

      expect(await setBoardingStop(trx, eventId, lea.token, r1, lea.id, null)).toMatchObject({ ok: true });
      expect(await stopOf(lea.id)).toBeNull();
      // No point given is the start too.
      expect(await setBoardingStop(trx, eventId, lea.token, r1, hugo.id, undefined)).toMatchObject({ ok: true });
      expect(await stopOf(hugo.id)).toBeNull();
    });
  });

  it("RV8.3: with the option off, any change of point is refused by stopsOff and nothing is written", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, hugo, r1, s2 } = await seedScene(trx);
      await trx.updateTable("event").set({ stops_enabled: false }).where("id", "=", eventId).execute();
      const before = await rowsOf(trx, eventId);

      expect(await setBoardingStop(trx, eventId, lea.token, r1, lea.id, s2)).toMatchObject({ ok: false, error: "stopsOff" });
      expect(await setBoardingStop(trx, eventId, lea.token, r1, hugo.id, null)).toMatchObject({ ok: false, error: "stopsOff" });

      expect(await rowsOf(trx, eventId)).toEqual(before);
    });
  });

  it("RV4.2: the same point as before is a success without a write", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, hugo, r1, s1 } = await seedScene(trx);
      const before = await rowsOf(trx, eventId);

      expect(await setBoardingStop(trx, eventId, lea.token, r1, hugo.id, s1)).toEqual({
        ok: true,
        state: await readEventState(trx, eventId, lea.token),
      });
      expect(await setBoardingStop(trx, eventId, lea.token, r1, lea.id, null)).toMatchObject({ ok: true });

      expect(await rowsOf(trx, eventId)).toEqual(before);
    });
  });

  it("RV4.4: the seat, the boarding time and the board stay as they were", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, hugo, r1, s1, s2 } = await seedScene(trx);
      const before = await rowsOf(trx, eventId);
      const boardBefore = await boardOf(trx, eventId, lea.token);
      const passengersBefore = await ridePassengers(trx, { id: r1, eventId, leg: "aller" });

      expect(await setBoardingStop(trx, eventId, lea.token, r1, lea.id, s2)).toMatchObject({ ok: true });
      expect(await setBoardingStop(trx, eventId, lea.token, r1, hugo.id, null)).toMatchObject({ ok: true });

      const after = await rowsOf(trx, eventId);
      // The point did change, or a change that writes nothing would pass for one that leaves the rest alone.
      const stopOf = (rows: typeof after, personId: string) => rows.find((row) => row.person_id === personId)?.stop_id;
      expect([stopOf(before, lea.id), stopOf(before, hugo.id)]).toEqual([null, s1]);
      expect([stopOf(after, lea.id), stopOf(after, hugo.id)]).toEqual([s2, null]);
      expect(after.map(({ person_id, ride_id, placed_at }) => ({ person_id, ride_id, placed_at }))).toEqual(
        before.map(({ person_id, ride_id, placed_at }) => ({ person_id, ride_id, placed_at })),
      );
      expect(await ridePassengers(trx, { id: r1, eventId, leg: "aller" })).toEqual(passengersBefore);
      expect(await boardOf(trx, eventId, lea.token)).toEqual(boardBefore);
    });
  });

  it("RV4.3: a point deleted meanwhile puts her at the start, with stopGone, in her car", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, hugo, r1, s1 } = await seedScene(trx);
      await trx.deleteFrom("stop").where("id", "=", s1).execute();

      const result = await setBoardingStop(trx, eventId, lea.token, r1, lea.id, s1);

      expect(result).toEqual({ ok: true, stopGone: true, state: await readEventState(trx, eventId, lea.token) });
      const rows = await rowsOf(trx, eventId);
      expect(rows.find((row) => row.person_id === lea.id)).toMatchObject({ ride_id: r1, stop_id: null });
      expect(rows.find((row) => row.person_id === hugo.id)).toMatchObject({ ride_id: r1, stop_id: null });
    });
  });

  it("RV4.3: a point of another car is gone for this one", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, r1, s3 } = await seedScene(trx);
      const result = await setBoardingStop(trx, eventId, lea.token, r1, lea.id, s3);
      expect(result).toMatchObject({ ok: true, stopGone: true });
      expect((await rowsOf(trx, eventId)).find((row) => row.person_id === lea.id)?.stop_id).toBeNull();
    });
  });

  it("RV4.3: rideGone for a car no longer offered, and notInCar for a person who is not in it", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, ines, r1, r2, s1 } = await seedScene(trx);
      const before = await rowsOf(trx, eventId);

      expect(await setBoardingStop(trx, eventId, lea.token, randomUUID(), lea.id, s1)).toMatchObject({
        ok: false,
        error: "rideGone",
      });
      // Léa is in r1, not in r2; Inès is without a car.
      expect(await setBoardingStop(trx, eventId, lea.token, r2, lea.id, null)).toMatchObject({ ok: false, error: "notInCar" });
      expect(await setBoardingStop(trx, eventId, lea.token, r1, ines.id, s1)).toEqual({
        ok: false,
        error: "notInCar",
        state: await readEventState(trx, eventId, lea.token),
      });
      expect(await rowsOf(trx, eventId)).toEqual(before);
    });
  });

  it("PL5.1: changes the point of a person of another device, with any token or none, and the seat stays", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, tom, hugo, r1, r2, s1, s3 } = await seedScene(trx);
      const s4 = await seedStop(trx, eventId, r2, { location: "Gare", time: "07:25:00" });
      const seat = (rows: Awaited<ReturnType<typeof rowsOf>>, personId: string) => rows.find((row) => row.person_id === personId);

      const start = await rowsOf(trx, eventId);
      // Léa's token moves Tom (another device) to another point of his car.
      const moved = await setBoardingStop(trx, eventId, lea.token, r2, tom.id, s4);
      expect(moved).toEqual({ ok: true, state: await readEventState(trx, eventId, lea.token) });
      const afterMove = await rowsOf(trx, eventId);
      expect(seat(afterMove, tom.id)).toMatchObject({ ride_id: r2, stop_id: s4 });

      // No token, a malformed one, a well-formed one held by nobody: Hugo is moved all the same.
      for (const [token, stop] of [[undefined, null], ["AAAA", s1], [NOBODYS_TOKEN, null]] as const) {
        expect(await setBoardingStop(trx, eventId, token, r1, hugo.id, stop)).toMatchObject({ ok: true });
        expect(seat(await rowsOf(trx, eventId), hugo.id)).toMatchObject({ ride_id: r1, stop_id: stop });
      }
      // Boarding time kept (RV4.4), and the point really changed from s3.
      expect(seat(afterMove, tom.id)?.placed_at).toEqual(seat(start, tom.id)?.placed_at);
      expect(seat(start, tom.id)?.stop_id).toBe(s3);
    });
  });

  it("PL5.1: a person of another device in another car is still notInCar for this one", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, tom, r1 } = await seedScene(trx);
      const before = await rowsOf(trx, eventId);
      expect(await setBoardingStop(trx, eventId, lea.token, r1, tom.id, null)).toMatchObject({ ok: false, error: "notInCar" });
      expect(await rowsOf(trx, eventId)).toEqual(before);
    });
  });

  it("RP5.4: personGone for a person removed from the event since, before rideGone", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, hugo, r1, s2 } = await seedScene(trx);
      await deleteSeededPerson(trx, eventId, hugo.id);

      const result = await setBoardingStop(trx, eventId, lea.token, r1, hugo.id, s2);
      expect(result).toEqual({
        ok: false,
        error: "personGone",
        goneIds: [hugo.id],
        state: await readEventState(trx, eventId, lea.token),
      });
      expect(await setBoardingStop(trx, eventId, lea.token, randomUUID(), hugo.id, s2)).toMatchObject({ error: "personGone" });
    });
  });

  it.each<[string, (scene: Awaited<ReturnType<typeof seedScene>>) => unknown[]]>([
    ["a ride id that is not a creation id", ({ lea, s1 }) => [42, lea.id, s1]],
    ["a person id that is not a creation id", ({ r1, s1 }) => [r1, "Léa", s1]],
    ["a point that is not a creation id", ({ r1, lea }) => [r1, lea.id, "Mairie"]],
    ["a point that is a number", ({ r1, lea }) => [r1, lea.id, 7]],
  ])("refuses %s as invalid, and writes nothing", async (_, request) => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      const before = await rowsOf(trx, scene.eventId);
      const [rideId, personId, stopId] = request(scene);

      const result = await setBoardingStop(trx, scene.eventId, scene.lea.token, rideId, personId, stopId);

      expect(result).toEqual({ ok: false, error: "invalid", state: await readEventState(trx, scene.eventId, scene.lea.token) });
      expect(await rowsOf(trx, scene.eventId)).toEqual(before);
    });
  });

  it("OA8.3: eventEnded comes before every other refusal, whatever the token and the request", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, r1, s1 } = await seedScene(trx);
      await anonymiseEvent(trx, eventId);
      expect(await setBoardingStop(trx, eventId, lea.token, r1, lea.id, s1)).toMatchObject({ ok: false, error: "eventEnded" });
      expect(await setBoardingStop(trx, eventId, NOBODYS_TOKEN, 42, "x", {})).toMatchObject({ ok: false, error: "eventEnded" });
    });
  });

  it("gives eventNotFound for an unknown event, and never looks up a malformed id", async () => {
    await withRollback(async (trx) => {
      expect(await setBoardingStop(trx, "Zz9yXw8v", NOBODYS_TOKEN, randomUUID(), randomUUID(), null)).toEqual({
        ok: false,
        error: "eventNotFound",
      });
    });
    expect(await setBoardingStop(untouchable, "Ab3dEf70", NOBODYS_TOKEN, randomUUID(), randomUUID(), null)).toEqual({
      ok: false,
      error: "eventNotFound",
    });
  });

  // Committed data, both orders: the Stop is deleted under the Ride's lock, or chosen under it.
  describe("at the same time as the Stop's deletion, on committed data", () => {
    async function aBoardedCar(db: Db, eventId: string) {
      await db.updateTable("event").set({ stops_enabled: true }).where("id", "=", eventId).execute();
      const driver = await seedPerson(db, eventId, { firstName: "Marc" });
      const lea = await seedPerson(db, eventId, { firstName: "Léa" });
      const rideId = await seedRide(db, eventId, driver.id, { seats: 3 });
      const stopId = await seedStop(db, eventId, rideId);
      await seedPlacement(db, { personId: lea.id, eventId, leg: "aller", rideId });
      return { lea, rideId, stopId };
    }

    it("RV4.3: a point deleted while the change waits for the Ride gives stopGone, never failed", async () => {
      await withCommittedEvent(async (db, eventId) => {
        const { lea, rideId, stopId } = await aBoardedCar(db, eventId);

        const second = await whileHeld(
          db,
          (trx) => removeStopUnderRide(trx, eventId, rideId, stopId),
          (own) => setBoardingStop(own, eventId, lea.token, rideId, lea.id, stopId),
        );

        expect(second).toMatchObject({ ok: true, stopGone: true });
        expect(await rowsOf(db, eventId)).toEqual([expect.objectContaining({ ride_id: rideId, stop_id: null })]);
      });
    });

    it("RV4.3: a point chosen first, then deleted under the Ride's lock, leaves her at the start in her car, never 23503", async () => {
      await withCommittedEvent(async (db, eventId) => {
        const { lea, rideId, stopId } = await aBoardedCar(db, eventId);

        await whileHeld(
          db,
          (trx) => setBoardingStop(trx, eventId, lea.token, rideId, lea.id, stopId),
          (own) => removeStopUnderRide(own, eventId, rideId, stopId),
          // The point was written in the first, which waits: without it, the end state would be the same.
          async (_pid, trx) => {
            expect(await rowsOf(trx, eventId)).toEqual([expect.objectContaining({ ride_id: rideId, stop_id: stopId })]);
          },
        );

        expect(await rowsOf(db, eventId)).toEqual([expect.objectContaining({ ride_id: rideId, stop_id: null })]);
      });
    });

    it("RV4.3: a car withdrawn while the change waits gives rideGone", async () => {
      await withCommittedEvent(async (db, eventId) => {
        const { lea, rideId, stopId } = await aBoardedCar(db, eventId);

        const second = await whileHeld(
          db,
          (trx) =>
            atomically(trx, async (inner) => {
              await lockRide(inner, { id: rideId, eventId, leg: "aller" });
              await inner.deleteFrom("ride").where("id", "=", rideId).execute();
            }),
          (own) => setBoardingStop(own, eventId, lea.token, rideId, lea.id, stopId),
        );

        expect(second).toMatchObject({ ok: false, error: "rideGone" });
      });
    });
  });
});
