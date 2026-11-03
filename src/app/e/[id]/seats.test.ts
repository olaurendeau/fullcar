import { randomUUID } from "node:crypto";
import { sql, TableNode, type Kysely, type KyselyPlugin } from "kysely";
import { describe, expect, it } from "vitest";
import { removePassengers } from "@/db/placements";
import { anonymiseEvent } from "@/db/day-thirty";
import { deleteRide, lockRide, ridePassengers } from "@/db/rides";
import type { Database } from "@/db/schema";
import { whileHeld, withCommittedEvent } from "@/db/test-committed";
import { withRollback } from "@/db/test-db";
import { atomically } from "@/db/transaction";
import { removeSeededRetour, seedEvent } from "@/db/test-events";
import { deleteSeededPerson, seedPerson, seedPlacement, seedRide, seedStop } from "@/db/test-participants";
import type { Leg } from "@/domain/leg";
import { readEventState, type EventState } from "./event-state";
import { takeSeats, undoSeats } from "./seats";

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
 * Aller: Marc drives r1 (3 seats), Zoé drives r2 with Tom. Léa and Hugo are without a car,
 * Inès is not concerned. Retour: Marc drives r3, Léa is without a car.
 * Léa, Hugo and Inès are the persons of one device; Marc, Zoé and Tom each have their own.
 */
async function seedScene(db: Db) {
  // The option « Points de RDV » is on: the points the tests send are the event's (RV8.3).
  const { id: eventId } = await seedEvent(db, { stopsEnabled: true });
  const marc = await seedPerson(db, eventId, { firstName: "Marc" });
  const zoe = await seedPerson(db, eventId, { firstName: "Zoé" });
  const tom = await seedPerson(db, eventId, { firstName: "Tom" });
  const lea = await seedPerson(db, eventId, { firstName: "Léa" });
  const hugo = await seedPerson(db, eventId, { firstName: "Hugo" }, lea.token);
  const ines = await seedPerson(db, eventId, { firstName: "Inès" }, lea.token);
  const r1 = await seedRide(db, eventId, marc.id, { leg: "aller" });
  const r2 = await seedRide(db, eventId, zoe.id, { leg: "aller" });
  const r3 = await seedRide(db, eventId, marc.id, { leg: "retour", departureTime: "18:30:00" });
  await seedPlacement(db, { personId: tom.id, eventId, leg: "aller", rideId: r2 });
  await seedPlacement(db, { personId: lea.id, eventId, leg: "aller", rideId: null });
  await seedPlacement(db, { personId: hugo.id, eventId, leg: "aller", rideId: null });
  await seedPlacement(db, { personId: lea.id, eventId, leg: "retour", rideId: null });
  return { eventId, marc, zoe, tom, lea, hugo, ines, r1, r2, r3 };
}

/** Every Placement of the event, boarding time included: a write that should not happen shows. */
async function placementsOf(db: Db, eventId: string) {
  return db
    .selectFrom("placement")
    .select(["person_id", "leg", "ride_id", "placed_at"])
    .where("event_id", "=", eventId)
    .orderBy("person_id")
    .orderBy("leg")
    .execute();
}

/** The first names in the car, as the state a result gives shows them. */
function passengersOf(result: object, leg: Leg, rideId: string): string[] {
  const state = "state" in result ? (result.state as EventState).legs : undefined;
  const car = state?.find((board) => board.leg === leg)?.cars.find((found) => found.id === rideId);
  if (car === undefined) throw new Error(`no car ${rideId} on the ${leg} in the state`);
  return car.passengers.map((person) => person.firstName);
}

describe("takeSeats", () => {
  it("C6.4, C3.5: places every person asked in the car, and leaves the others and the other leg as they were", async () => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      const { eventId, lea, hugo, ines, r1 } = scene;
      const before = await placementsOf(trx, eventId);

      const result = await takeSeats(trx, eventId, lea.token, r1, "aller", [lea.id, hugo.id]);

      expect(result).toEqual({ ok: true, state: await readEventState(trx, eventId, lea.token) });
      expect(passengersOf(result, "aller", r1).sort()).toEqual(["Hugo", "Léa"]);
      const after = await placementsOf(trx, eventId);
      const placed = new Set([lea.id, hugo.id]);
      expect(after.filter((row) => row.leg === "aller" && placed.has(row.person_id)).map((row) => row.ride_id)).toEqual([
        r1,
        r1,
      ]);
      // Everything else, the retour and Inès (not concerned, no row) included, is untouched.
      const untouched = (rows: typeof before) => rows.filter((row) => !(row.leg === "aller" && placed.has(row.person_id)));
      expect(untouched(after)).toEqual(untouched(before));
      expect(after.some((row) => row.person_id === ines.id)).toBe(false);
    });
  });

  it("C5.8: a person already in this car is a success, and nothing is written", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, hugo, r1 } = await seedScene(trx);
      await seedPlacement(trx, { personId: lea.id, eventId, leg: "aller", rideId: r1 });
      await sql`update placement set placed_at = now() - interval '1 hour' where person_id = ${lea.id}`.execute(trx);
      const before = await placementsOf(trx, eventId);

      expect(await takeSeats(trx, eventId, lea.token, r1, "aller", [lea.id])).toMatchObject({ ok: true });
      expect(await placementsOf(trx, eventId)).toEqual(before);

      // Sent again with someone new, only the newcomer is written.
      expect(await takeSeats(trx, eventId, lea.token, r1, "aller", [lea.id, hugo.id])).toMatchObject({ ok: true });
      const after = await placementsOf(trx, eventId);
      expect(after.find((row) => row.person_id === lea.id && row.leg === "aller")).toEqual(
        before.find((row) => row.person_id === lea.id && row.leg === "aller"),
      );
      expect(after.find((row) => row.person_id === hugo.id && row.leg === "aller")?.ride_id).toBe(r1);
    });
  });

  it.each<[string, (scene: Awaited<ReturnType<typeof seedScene>>) => [unknown, unknown, unknown]]>([
    ["nobody asked (#105)", ({ r1 }) => [r1, "aller", []]],
    ["persons that are not a list", ({ r1, lea }) => [r1, "aller", lea.id]],
    ["a person id that is not a creation id", ({ r1 }) => [r1, "aller", ["Léa"]]],
    ["a ride id that is not a creation id", ({ lea }) => [42, "aller", [lea.id]]],
    ["an unknown leg", ({ r1, lea }) => [r1, "lundi", [lea.id]]],
  ])("refuses %s as invalid, writes nothing, and gives the state", async (_, request) => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      const before = await placementsOf(trx, scene.eventId);
      const [rideId, leg, personIds] = request(scene);

      const result = await takeSeats(trx, scene.eventId, scene.lea.token, rideId, leg, personIds);

      expect(result).toEqual({
        ok: false,
        error: "invalid",
        state: await readEventState(trx, scene.eventId, scene.lea.token),
      });
      expect(await placementsOf(trx, scene.eventId)).toEqual(before);
    });
  });

  describe("PL2.9: places any person of the event, whoever holds her, with any token or none", () => {
    it("Tom and Léa, of device A, are placed from the token of B: both Placements exist", async () => {
      await withRollback(async (trx) => {
        const { id: eventId } = await seedEvent(trx);
        const driver = await seedPerson(trx, eventId, { firstName: "Marc" });
        const a = await seedPerson(trx, eventId, { firstName: "Tom" });
        const aSecond = await seedPerson(trx, eventId, { firstName: "Léa" }, a.token);
        const b = await seedPerson(trx, eventId, { firstName: "Béa" });
        const ride = await seedRide(trx, eventId, driver.id, { leg: "aller" });
        await seedPlacement(trx, { personId: a.id, eventId, leg: "aller", rideId: null });
        await seedPlacement(trx, { personId: aSecond.id, eventId, leg: "aller", rideId: null });

        const result = await takeSeats(trx, eventId, b.token, ride, "aller", [a.id, aSecond.id]);

        expect(result).toEqual({ ok: true, state: await readEventState(trx, eventId, b.token) });
        expect(passengersOf(result, "aller", ride).sort()).toEqual(["Léa", "Tom"]);
        const rows = await placementsOf(trx, eventId);
        expect(rows.filter((row) => row.ride_id === ride).map((row) => row.person_id).sort()).toEqual([a.id, aSecond.id].sort());
      });
    });

    it.each<[string, (scene: Awaited<ReturnType<typeof seedScene>>, otherToken: string) => unknown]>([
      ["the token of another person of the event", ({ tom }) => tom.token],
      ["the token of another event", (_, otherToken) => otherToken],
      ["no token", () => undefined],
      ["a well-formed token nobody holds", () => NOBODYS_TOKEN],
      ["a malformed token", () => "AAAA"],
    ])("%s places Léa and Hugo, and the state has no device person and no number (C10.6)", async (_, tokenOf) => {
      await withRollback(async (trx) => {
        const scene = await seedScene(trx);
        const other = await seedScene(trx);
        const { eventId, lea, hugo, r1 } = scene;
        const token = tokenOf(scene, other.lea.token);
        await sql`update person set phone = '0612345678' where id = ${lea.id}`.execute(trx);

        const result = await takeSeats(trx, eventId, token, r1, "aller", [lea.id, hugo.id]);

        const state = await readEventState(trx, eventId, token);
        expect(result).toEqual({ ok: true, state });
        expect(passengersOf(result, "aller", r1).sort()).toEqual(["Hugo", "Léa"]);
        expect(JSON.stringify(state)).not.toContain("0612345678");
      });
    });

    it("PL7.2: after a placement from another device, the state carries only the numbers phoneVisible gives", async () => {
      await withRollback(async (trx) => {
        const { eventId, lea, hugo, tom, marc, zoe, r1 } = await seedScene(trx);
        for (const [person, phone] of [[lea, "0611111111"], [tom, "0622222222"], [marc, "0633333333"], [zoe, "0644444444"]] as const) {
          await sql`update person set phone = ${phone} where id = ${person.id}`.execute(trx);
        }
        // Tom (his own device, in Zoé's car) places Léa and Hugo in Marc's car, which is not his.
        const result = await takeSeats(trx, eventId, tom.token, r1, "aller", [lea.id, hugo.id]);

        const seen = JSON.stringify((result as { state: unknown }).state);
        expect(seen).toContain("0622222222");
        expect(seen).toContain("0644444444");
        expect(seen).not.toContain("0611111111");
        expect(seen).not.toContain("0633333333");
      });
    });

    it("a person unknown to the event is personGone, and nobody else is placed", async () => {
      await withRollback(async (trx) => {
        const { eventId, lea, tom, r1 } = await seedScene(trx);
        const before = await placementsOf(trx, eventId);
        const stranger = randomUUID();
        const result = await takeSeats(trx, eventId, tom.token, r1, "aller", [lea.id, stranger]);
        expect(result).toMatchObject({ ok: false, error: "personGone", goneIds: [stranger] });
        expect(await placementsOf(trx, eventId)).toEqual(before);
      });
    });

    it("a real person of another event is personGone, and nothing is written to either event", async () => {
      await withRollback(async (trx) => {
        const { eventId, lea, r1 } = await seedScene(trx);
        const other = await seedScene(trx);
        const before = [await placementsOf(trx, eventId), await placementsOf(trx, other.eventId)];
        const result = await takeSeats(trx, eventId, lea.token, r1, "aller", [lea.id, other.lea.id]);
        expect(result).toMatchObject({ ok: false, error: "personGone", goneIds: [other.lea.id] });
        expect([await placementsOf(trx, eventId), await placementsOf(trx, other.eventId)]).toEqual(before);
      });
    });
  });

  it.each<[string, (scene: Awaited<ReturnType<typeof seedScene>>) => [string, string, Leg]]>([
    ["C5.6, C12.8: the driver, into their own car", ({ marc, r1 }) => [marc.token, r1, "aller"]],
    ["C5.6, C12.8: a driver of the leg, into another car", ({ zoe, r1 }) => [zoe.token, r1, "aller"]],
    ["a passenger of another car of the leg", ({ tom, r1 }) => [tom.token, r1, "aller"]],
  ])("refuses %s as alreadyInCar, and nothing changes", async (_, request) => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      const before = await placementsOf(trx, scene.eventId);
      const [token, rideId, leg] = request(scene);
      const personId = [scene.marc, scene.zoe, scene.tom].find((person) => person.token === token)?.id;

      const result = await takeSeats(trx, scene.eventId, token, rideId, leg, [personId]);

      expect(result).toEqual({ ok: false, error: "alreadyInCar", state: await readEventState(trx, scene.eventId, token) });
      expect(await placementsOf(trx, scene.eventId)).toEqual(before);
    });
  });

  it("places a driver of the aller on the retour, where she does not drive", async () => {
    await withRollback(async (trx) => {
      const { eventId, zoe, r3 } = await seedScene(trx);
      expect(await takeSeats(trx, eventId, zoe.token, r3, "retour", [zoe.id])).toMatchObject({ ok: true });
      expect(await ridePassengers(trx, { id: r3, eventId, leg: "retour" })).toEqual([
        expect.objectContaining({ personId: zoe.id }),
      ]);
    });
  });

  it("D3: one person asked already in another car places nobody", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, hugo, r1, r2 } = await seedScene(trx);
      await seedPlacement(trx, { personId: lea.id, eventId, leg: "aller", rideId: r2 });
      const before = await placementsOf(trx, eventId);
      expect(await takeSeats(trx, eventId, lea.token, r1, "aller", [hugo.id, lea.id])).toMatchObject({
        ok: false,
        error: "alreadyInCar",
      });
      expect(await placementsOf(trx, eventId)).toEqual(before);
    });
  });

  it("C6.3, D3: more persons than free seats places nobody, and gives the seats left", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, hugo, ines } = await seedScene(trx);
      const small = await seedRide(trx, eventId, (await seedPerson(trx, eventId, { firstName: "Max" })).id, { seats: 2 });
      const before = await placementsOf(trx, eventId);
      const result = await takeSeats(trx, eventId, lea.token, small, "aller", [lea.id, hugo.id, ines.id]);
      expect(result).toMatchObject({ ok: false, error: "notEnoughSeats", freeSeats: 2 });
      expect(await placementsOf(trx, eventId)).toEqual(before);
    });
  });

  it("C5.7: one person into a full car is told the seat is taken", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, r2 } = await seedScene(trx);
      await trx.updateTable("ride").set({ seats: 1 }).where("id", "=", r2).execute();
      const before = await placementsOf(trx, eventId);
      const result = await takeSeats(trx, eventId, lea.token, r2, "aller", [lea.id, lea.id]);
      expect(result).toEqual({ ok: false, error: "seatTaken", state: await readEventState(trx, eventId, lea.token) });
      expect(await placementsOf(trx, eventId)).toEqual(before);
    });
  });

  it.each<[string, (scene: Awaited<ReturnType<typeof seedScene>>, db: Db) => Promise<[string, string, Leg]>]>([
    [
      "C6.8: a car withdrawn",
      async ({ eventId, r1 }, db) => {
        await deleteRide(db, { id: r1, eventId, leg: "aller" });
        return [eventId, r1, "aller"];
      },
    ],
    ["a car of the other leg", async ({ eventId, r3 }) => [eventId, r3, "aller"]],
    ["a car never offered", async ({ eventId }) => [eventId, randomUUID(), "aller"]],
  ])("refuses %s as rideGone, and nobody is placed", async (_, request) => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      const [eventId, rideId, leg] = await request(scene, trx);
      const before = await placementsOf(trx, eventId);
      const result = await takeSeats(trx, eventId, scene.lea.token, rideId, leg, [scene.lea.id]);
      expect(result).toEqual({ ok: false, error: "rideGone", state: await readEventState(trx, eventId, scene.lea.token) });
      expect(await placementsOf(trx, eventId)).toEqual(before);
    });
  });

  it("refuses a car of another event as rideGone", async () => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      const other = await seedScene(trx);
      const result = await takeSeats(trx, scene.eventId, scene.lea.token, other.r1, "aller", [scene.lea.id]);
      expect(result).toMatchObject({ ok: false, error: "rideGone" });
      expect(await ridePassengers(trx, { id: other.r1, eventId: other.eventId, leg: "aller" })).toEqual([]);
    });
  });

  it("refuses an unknown event as eventNotFound, forged request or not, and never looks up a malformed id", async () => {
    const eventNotFound = { ok: false, error: "eventNotFound" };
    await withRollback(async (trx) => {
      const { eventId, lea, r1 } = await seedScene(trx);
      const before = await placementsOf(trx, eventId);
      expect(await takeSeats(trx, "Zz9yXw8v", lea.token, r1, "aller", [lea.id])).toEqual(eventNotFound);
      expect(await takeSeats(trx, "Zz9yXw8v", lea.token, "r1", "aller", [])).toEqual(eventNotFound);
      expect(await placementsOf(trx, eventId)).toEqual(before);
    });
    expect(await takeSeats(untouchable, "Ab3dEf70", NOBODYS_TOKEN, randomUUID(), "aller", [randomUUID()])).toEqual(
      eventNotFound,
    );
  });

  // readEventState refuses to read in READ COMMITTED (#126): on the connection, the write
  // commits in its own transaction, and the state is read after it, on one snapshot.
  it("on the connection, commits the seats, then gives the state read after the commit", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const driver = await seedPerson(db, eventId, { firstName: "Marc" });
      const lea = await seedPerson(db, eventId, { firstName: "Léa" });
      const rideId = await seedRide(db, eventId, driver.id);

      const result = await takeSeats(db, eventId, lea.token, rideId, "aller", [lea.id]);

      expect(result).toMatchObject({ ok: true });
      expect(passengersOf(result, "aller", rideId)).toEqual(["Léa"]);
      expect(await ridePassengers(db, { id: rideId, eventId, leg: "aller" })).toEqual([
        expect.objectContaining({ personId: lea.id }),
      ]);
    });
  });

  // C12.11: these pass only because the second locks the Ride before it counts.
  describe("at the same time as another session, on committed data", () => {
    async function aCar(db: Db, eventId: string, seats: number) {
      const driver = await seedPerson(db, eventId, { firstName: "Marc" });
      return seedRide(db, eventId, driver.id, { seats });
    }

    it("C5.7: two takes of the last seat give one Placement and one seatTaken", async () => {
      await withCommittedEvent(async (db, eventId) => {
        const rideId = await aCar(db, eventId, 1);
        const lea = await seedPerson(db, eventId, { firstName: "Léa" });
        const tom = await seedPerson(db, eventId, { firstName: "Tom" });

        const second = await whileHeld(
          db,
          (trx) => takeSeats(trx, eventId, lea.token, rideId, "aller", [lea.id]),
          (own) => takeSeats(own, eventId, tom.token, rideId, "aller", [tom.id]),
        );

        expect(second).toMatchObject({ ok: false, error: "seatTaken" });
        expect(passengersOf(second, "aller", rideId)).toEqual(["Léa"]);
        expect(await ridePassengers(db, { id: rideId, eventId, leg: "aller" })).toEqual([
          expect.objectContaining({ personId: lea.id }),
        ]);
      });
    });

    it("C6.5: a take that leaves one seat for two persons asked places neither", async () => {
      await withCommittedEvent(async (db, eventId) => {
        const rideId = await aCar(db, eventId, 2);
        const tom = await seedPerson(db, eventId, { firstName: "Tom" });
        const lea = await seedPerson(db, eventId, { firstName: "Léa" });
        const hugo = await seedPerson(db, eventId, { firstName: "Hugo" }, lea.token);

        const second = await whileHeld(
          db,
          (trx) => takeSeats(trx, eventId, tom.token, rideId, "aller", [tom.id]),
          (own) => takeSeats(own, eventId, lea.token, rideId, "aller", [lea.id, hugo.id]),
        );

        expect(second).toMatchObject({ ok: false, error: "notEnoughSeats", freeSeats: 1 });
        const passengers = await ridePassengers(db, { id: rideId, eventId, leg: "aller" });
        expect(passengers.map((passenger) => passenger.personId)).toEqual([tom.id]);
      });
    });

    it("C6.8: a car withdrawn while the take waits gives rideGone, and nobody is placed", async () => {
      await withCommittedEvent(async (db, eventId) => {
        const rideId = await aCar(db, eventId, 3);
        const lea = await seedPerson(db, eventId, { firstName: "Léa" });

        const second = await whileHeld(
          db,
          (trx) => deleteRide(trx, { id: rideId, eventId, leg: "aller" }),
          (own) => takeSeats(own, eventId, lea.token, rideId, "aller", [lea.id]),
        );

        expect(second).toMatchObject({ ok: false, error: "rideGone" });
        expect(await placementsOf(db, eventId)).toEqual([]);
      });
    });

    it("the same person taken into two cars at once is placed in one, the other gives alreadyInCar", async () => {
      await withCommittedEvent(async (db, eventId) => {
        const first = await aCar(db, eventId, 3);
        const other = await aCar(db, eventId, 3);
        const lea = await seedPerson(db, eventId, { firstName: "Léa" });

        const second = await whileHeld(
          db,
          (trx) => takeSeats(trx, eventId, lea.token, first, "aller", [lea.id]),
          (own) => takeSeats(own, eventId, lea.token, other, "aller", [lea.id]),
        );

        expect(second).toMatchObject({ ok: false, error: "alreadyInCar" });
        expect(await placementsOf(db, eventId)).toEqual([expect.objectContaining({ person_id: lea.id, ride_id: first })]);
      });
    });
  });
});

describe("undoSeats", () => {
  type Scene = Awaited<ReturnType<typeof seatedScene>>;

  /** Léa (without a car before) and Inès (not concerned before) took seats in r1, on the aller. */
  async function seatedScene(db: Db) {
    const scene = await seedScene(db);
    const { eventId, lea, ines, r1 } = scene;
    expect(await takeSeats(db, eventId, lea.token, r1, "aller", [lea.id, ines.id])).toMatchObject({ ok: true });
    const undo = [
      { personId: lea.id, before: "withoutCar" },
      { personId: ines.id, before: "notConcerned" },
    ];
    return { ...scene, undo };
  }

  /** Where each person stands on the leg: her Ride, `null` without a car; absent if not concerned. */
  async function standing(db: Db, eventId: string, leg: Leg) {
    const rows = await placementsOf(db, eventId);
    return Object.fromEntries(rows.filter((row) => row.leg === leg).map((row) => [row.person_id, row.ride_id]));
  }

  it("C5.10, C3.5: gives each person her state before on that leg, frees the seats, and leaves the other leg", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, hugo, ines, tom, r1, r2, undo } = await seatedScene(trx);
      const retour = (await placementsOf(trx, eventId)).filter((row) => row.leg === "retour");

      const result = await undoSeats(trx, eventId, lea.token, r1, "aller", undo);

      expect(result).toEqual({ ok: true, undoneIds: [lea.id, ines.id], state: await readEventState(trx, eventId, lea.token) });
      expect(passengersOf(result, "aller", r1)).toEqual([]);
      // Léa is without a car again, Inès has no Placement on the aller: not concerned again.
      expect(await standing(trx, eventId, "aller")).toEqual({ [lea.id]: null, [hugo.id]: null, [tom.id]: r2 });
      expect(Object.keys(await standing(trx, eventId, "aller"))).not.toContain(ines.id);
      expect((await placementsOf(trx, eventId)).filter((row) => row.leg === "retour")).toEqual(retour);
    });
  });

  it("C5.10: a real person of another event, in a car of hers, is not undone, and nothing is written to either event", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, ines, r1 } = await seatedScene(trx);
      const other = await seatedScene(trx);
      await sql`update placement set placed_at = now() - interval '1 hour' where event_id in (${eventId}, ${other.eventId})`.execute(trx);
      const before = [await placementsOf(trx, eventId), await placementsOf(trx, other.eventId)];

      const result = await undoSeats(trx, eventId, lea.token, r1, "aller", [
        { personId: other.lea.id, before: "withoutCar" },
        { personId: other.ines.id, before: "notConcerned" },
      ]);

      expect(result).toMatchObject({ ok: true, undoneIds: [] });
      expect([await placementsOf(trx, eventId), await placementsOf(trx, other.eventId)]).toEqual(before);
      // Her own event's seats are still taken, and so are the other event's.
      expect(await standing(trx, eventId, "aller")).toMatchObject({ [lea.id]: r1, [ines.id]: r1 });
      expect(await standing(trx, other.eventId, "aller")).toMatchObject({ [other.lea.id]: other.r1, [other.ines.id]: other.r1 });
    });
  });

  it("C5.10, as C7.4: a person no longer in this car is not touched, and is not among those undone", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, hugo, ines, r1, r2 } = await seedScene(trx);
      expect(await takeSeats(trx, eventId, lea.token, r1, "aller", [lea.id, hugo.id, ines.id])).toMatchObject({ ok: true });
      // Léa moved to Zoé's car, Hugo left without a car: only Inès is still in r1.
      await seedPlacement(trx, { personId: lea.id, eventId, leg: "aller", rideId: r2 });
      await removePassengers(trx, { id: r1, eventId, leg: "aller" }, [hugo.id]);
      await sql`update placement set placed_at = now() - interval '1 hour' where event_id = ${eventId}`.execute(trx);
      const before = await placementsOf(trx, eventId);

      const result = await undoSeats(trx, eventId, lea.token, r1, "aller", [
        { personId: lea.id, before: "withoutCar" },
        { personId: hugo.id, before: "notConcerned" },
        { personId: ines.id, before: "notConcerned" },
      ]);

      expect(result).toMatchObject({ ok: true, undoneIds: [ines.id] });
      const others = (rows: typeof before) => rows.filter((row) => row.person_id !== ines.id);
      expect(others(await placementsOf(trx, eventId))).toEqual(others(before));
      expect(Object.keys(await standing(trx, eventId, "aller"))).not.toContain(ines.id);
    });
  });

  it.each<[string, (scene: Scene) => [unknown, unknown, unknown]]>([
    ["nobody asked", ({ r1 }) => [r1, "aller", []]],
    ["persons that are not a list", ({ r1, lea }) => [r1, "aller", { personId: lea.id, before: "withoutCar" }]],
    ["an entry that is not an object", ({ r1 }) => [r1, "aller", [null]]],
    ["an unknown state before", ({ r1, lea }) => [r1, "aller", [{ personId: lea.id, before: "inCar" }]]],
    ["no state before", ({ r1, lea }) => [r1, "aller", [{ personId: lea.id }]]],
    ["a person id that is not a creation id", ({ r1 }) => [r1, "aller", [{ personId: "Léa", before: "withoutCar" }]]],
    [
      "the same person twice",
      ({ r1, lea }) => [
        r1,
        "aller",
        [
          { personId: lea.id, before: "withoutCar" },
          { personId: lea.id, before: "notConcerned" },
        ],
      ],
    ],
    ["a ride id that is not a creation id", ({ lea }) => [42, "aller", [{ personId: lea.id, before: "withoutCar" }]]],
    ["an unknown leg", ({ r1, lea }) => [r1, "lundi", [{ personId: lea.id, before: "withoutCar" }]]],
  ])("refuses %s as invalid, writes nothing, and gives the state", async (_, request) => {
    await withRollback(async (trx) => {
      const scene = await seatedScene(trx);
      const before = await placementsOf(trx, scene.eventId);
      const [rideId, leg, persons] = request(scene);

      const result = await undoSeats(trx, scene.eventId, scene.lea.token, rideId, leg, persons);

      expect(result).toEqual({ ok: false, error: "invalid", state: await readEventState(trx, scene.eventId, scene.lea.token) });
      expect(await placementsOf(trx, scene.eventId)).toEqual(before);
    });
  });

  describe("PL4.3: gives back persons of any device, with any token or none", () => {
    it.each<[string, (scene: Scene, otherToken: string) => unknown]>([
      ["the token of another person of the event", ({ tom }) => tom.token],
      ["the token of another event", (_, otherToken) => otherToken],
      ["no token", () => undefined],
      ["a well-formed token nobody holds", () => NOBODYS_TOKEN],
      ["a malformed token", () => "AAAA"],
    ])("%s", async (_, tokenOf) => {
      await withRollback(async (trx) => {
        const scene = await seatedScene(trx);
        const other = await seedScene(trx);
        const { eventId, lea, ines, hugo, tom, r1, r2 } = scene;
        const token = tokenOf(scene, other.lea.token);

        const result = await undoSeats(trx, eventId, token, r1, "aller", scene.undo);

        expect(result).toEqual({ ok: true, undoneIds: [lea.id, ines.id], state: await readEventState(trx, eventId, token) });
        expect(await standing(trx, eventId, "aller")).toEqual({ [lea.id]: null, [hugo.id]: null, [tom.id]: r2 });
        // Given back already: nobody is left to give back (Seat.alreadyOut), and nothing is written.
        const before = await placementsOf(trx, eventId);
        expect(await undoSeats(trx, eventId, token, r1, "aller", scene.undo)).toMatchObject({ ok: true, undoneIds: [] });
        expect(await placementsOf(trx, eventId)).toEqual(before);
      });
    });

    it("a person of another device in the same request is given back with the others", async () => {
      await withRollback(async (trx) => {
        const { eventId, lea, tom, r1, undo } = await seatedScene(trx);
        await seedPlacement(trx, { personId: tom.id, eventId, leg: "aller", rideId: r1 });
        const asked = [...undo, { personId: tom.id, before: "withoutCar" }];
        const result = await undoSeats(trx, eventId, lea.token, r1, "aller", asked);
        expect(result).toMatchObject({ ok: true, undoneIds: expect.arrayContaining([tom.id]) });
        expect(passengersOf(result, "aller", r1)).toEqual([]);
      });
    });
  });

  it.each<[string, (scene: Scene, db: Db) => Promise<[string, Leg]>]>([
    [
      "a car withdrawn since, whose passengers are already without a car",
      async ({ eventId, r1 }, db) => {
        await deleteRide(db, { id: r1, eventId, leg: "aller" });
        return [r1, "aller"];
      },
    ],
    ["a car of the other leg", async ({ r3 }) => [r3, "aller"]],
    ["a car never offered", async () => [randomUUID(), "aller"]],
  ])("succeeds for %s, and undoes nobody", async (_, request) => {
    await withRollback(async (trx) => {
      const scene = await seatedScene(trx);
      const [rideId, leg] = await request(scene, trx);
      const before = await placementsOf(trx, scene.eventId);
      const result = await undoSeats(trx, scene.eventId, scene.lea.token, rideId, leg, scene.undo);
      expect(result).toEqual({ ok: true, undoneIds: [], state: await readEventState(trx, scene.eventId, scene.lea.token) });
      expect(await placementsOf(trx, scene.eventId)).toEqual(before);
    });
  });

  it("undoes nobody through a car of another event", async () => {
    await withRollback(async (trx) => {
      const scene = await seatedScene(trx);
      const other = await seatedScene(trx);
      const before = await placementsOf(trx, other.eventId);
      const result = await undoSeats(trx, scene.eventId, scene.lea.token, other.r1, "aller", scene.undo);
      expect(result).toMatchObject({ ok: true, undoneIds: [] });
      expect(await placementsOf(trx, other.eventId)).toEqual(before);
    });
  });

  it("refuses an unknown event as eventNotFound, forged request or not, and never looks up a malformed id", async () => {
    const eventNotFound = { ok: false, error: "eventNotFound" };
    await withRollback(async (trx) => {
      const { eventId, lea, r1, undo } = await seatedScene(trx);
      const before = await placementsOf(trx, eventId);
      expect(await undoSeats(trx, "Zz9yXw8v", lea.token, r1, "aller", undo)).toEqual(eventNotFound);
      expect(await undoSeats(trx, "Zz9yXw8v", lea.token, "r1", "aller", [])).toEqual(eventNotFound);
      expect(await placementsOf(trx, eventId)).toEqual(before);
    });
    const undo = [{ personId: randomUUID(), before: "withoutCar" }];
    expect(await undoSeats(untouchable, "Ab3dEf70", NOBODYS_TOKEN, randomUUID(), "aller", undo)).toEqual(eventNotFound);
  });

  describe("on committed data", () => {
    /** Marc drives r1; Léa (without a car before) and Inès (not concerned before), of one device, are in it. */
    async function seatedCommitted(db: Db, eventId: string) {
      const marc = await seedPerson(db, eventId, { firstName: "Marc" });
      const lea = await seedPerson(db, eventId, { firstName: "Léa" });
      const ines = await seedPerson(db, eventId, { firstName: "Inès" }, lea.token);
      const r1 = await seedRide(db, eventId, marc.id);
      await seedPlacement(db, { personId: lea.id, eventId, leg: "aller", rideId: r1 });
      await seedPlacement(db, { personId: ines.id, eventId, leg: "aller", rideId: r1 });
      const undo = [
        { personId: lea.id, before: "withoutCar" },
        { personId: ines.id, before: "notConcerned" },
      ];
      return { lea, ines, r1, undo };
    }

    /** A connection whose delete from `placement` fails, as if the database broke at that moment. */
    const failingPlacementDelete: KyselyPlugin = {
      transformQuery({ node }) {
        const from = node.kind === "DeleteQueryNode" ? node.from.froms[0] : undefined;
        if (from && TableNode.is(from) && from.table.identifier.name === "placement") throw new Error("injected failure");
        return node;
      },
      async transformResult({ result }) {
        return result;
      },
    };

    // readEventState refuses to read in READ COMMITTED (#126): the state is read after the commit.
    it("on the connection, commits the undo, then gives the state read after the commit", async () => {
      await withCommittedEvent(async (db, eventId) => {
        const { lea, ines, r1, undo } = await seatedCommitted(db, eventId);

        const result = await undoSeats(db, eventId, lea.token, r1, "aller", undo);

        expect(result).toMatchObject({ ok: true, undoneIds: [lea.id, ines.id] });
        expect(passengersOf(result, "aller", r1)).toEqual([]);
        expect(await standing(db, eventId, "aller")).toEqual({ [lea.id]: null });
      });
    });

    it("C5.10, all or nothing: a failure at the second write leaves every person in the car", async () => {
      await withCommittedEvent(async (db, eventId) => {
        const { lea, r1, undo } = await seatedCommitted(db, eventId);
        const before = await placementsOf(db, eventId);
        const failing = db.withPlugin(failingPlacementDelete);

        await expect(undoSeats(failing, eventId, lea.token, r1, "aller", undo)).rejects.toThrow("injected failure");

        expect(await placementsOf(db, eventId)).toEqual(before);
      });
    });

    // The undo locks the Ride before it reads who is in it: while another session holds the
    // Ride, Léa moves to Zoé's car, and the undo, once let through, sees it.
    it("waits for a session that holds the Ride, then undoes only those still in it", async () => {
      await withCommittedEvent(async (db, eventId) => {
        const { lea, ines, r1, undo } = await seatedCommitted(db, eventId);
        const zoe = await seedPerson(db, eventId, { firstName: "Zoé" });
        const r2 = await seedRide(db, eventId, zoe.id);

        const result = await whileHeld(
          db,
          async (trx) => {
            await lockRide(trx, { id: r1, eventId, leg: "aller" });
            await seedPlacement(trx, { personId: lea.id, eventId, leg: "aller", rideId: r2 });
          },
          (own) => undoSeats(own, eventId, lea.token, r1, "aller", undo),
        );

        expect(result).toMatchObject({ ok: true, undoneIds: [ines.id] });
        expect(await standing(db, eventId, "aller")).toEqual({ [lea.id]: r2 });
      });
    });

    // The Ride alone, no Placement: without the undo's lock on the car, nothing would make it wait.
    it("waits for a session that holds the Ride alone, then undoes", async () => {
      await withCommittedEvent(async (db, eventId) => {
        const { lea, ines, r1, undo } = await seatedCommitted(db, eventId);

        const result = await whileHeld(
          db,
          (trx) => lockRide(trx, { id: r1, eventId, leg: "aller" }),
          (own) => undoSeats(own, eventId, lea.token, r1, "aller", undo),
        );

        expect(result).toMatchObject({ ok: true, undoneIds: [lea.id, ines.id] });
        expect(await standing(db, eventId, "aller")).toEqual({ [lea.id]: null });
      });
    });
  });
});

// M7.7, M7.10, decision 40: the page still shows the retour the organiser removed.
describe("on a retour removed meanwhile", () => {
  it("M7.7: takeSeats is refused by noRetour, with the state, before rideGone, and nothing is written", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, r3 } = await seedScene(trx);
      await removeSeededRetour(trx, eventId);
      const before = await placementsOf(trx, eventId);

      const result = await takeSeats(trx, eventId, lea.token, r3, "retour", [lea.id]);

      expect(result).toEqual({ ok: false, error: "noRetour", state: await readEventState(trx, eventId, lea.token) });
      expect(await takeSeats(trx, eventId, NOBODYS_TOKEN, r3, "retour", [lea.id])).toMatchObject({ error: "noRetour" });
      expect(await placementsOf(trx, eventId)).toEqual(before);
    });
  });

  it("M7.10: undoSeats is refused by noRetour, with the state, and nothing is written", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, r3 } = await seedScene(trx);
      expect(await takeSeats(trx, eventId, lea.token, r3, "retour", [lea.id])).toMatchObject({ ok: true });
      await removeSeededRetour(trx, eventId);
      const before = await placementsOf(trx, eventId);

      const result = await undoSeats(trx, eventId, lea.token, r3, "retour", [{ personId: lea.id, before: "withoutCar" }]);

      expect(result).toEqual({ ok: false, error: "noRetour", state: await readEventState(trx, eventId, lea.token) });
      expect(await placementsOf(trx, eventId)).toEqual(before);
    });
  });
});

// RP5.4: the page still shows a person removed from the event since, by another device or the organiser.
describe("on a person removed meanwhile", () => {
  it("RP5.4: takeSeats, all or nothing, is refused by personGone for one person gone, with the state, and places nobody", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, hugo, r1 } = await seedScene(trx);
      await deleteSeededPerson(trx, eventId, hugo.id);
      const before = await placementsOf(trx, eventId);

      const result = await takeSeats(trx, eventId, lea.token, r1, "aller", [lea.id, hugo.id]);

      expect(result).toEqual({ ok: false, error: "personGone", goneIds: [hugo.id], state: await readEventState(trx, eventId, lea.token) });
      expect(await placementsOf(trx, eventId)).toEqual(before);
    });
  });

  it("a person of another device among them does not hide personGone, which lists only the one gone", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, hugo, marc, r1 } = await seedScene(trx);
      await deleteSeededPerson(trx, eventId, hugo.id);
      const result = await takeSeats(trx, eventId, lea.token, r1, "aller", [hugo.id, marc.id]);
      expect(result).toMatchObject({ ok: false, error: "personGone", goneIds: [hugo.id] });
    });
  });

  it("M7.7: on a retour removed too, takeSeats says noRetour before personGone", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, r3 } = await seedScene(trx);
      await removeSeededRetour(trx, eventId);
      await deleteSeededPerson(trx, eventId, lea.id);
      expect(await takeSeats(trx, eventId, lea.token, r3, "retour", [lea.id])).toMatchObject({ ok: false, error: "noRetour" });
    });
  });

  // Read before her removal committed, she is gone once her Person is locked: no Placement to a
  // person who is no longer there, so no foreign key's failure, and the others are not placed either.
  it("RP5.4: takeSeats that waited for a removal is refused by personGone, never failed, and places nobody", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const marc = await seedPerson(db, eventId, { firstName: "Marc" });
      const rideId = await seedRide(db, eventId, marc.id);
      const lea = await seedPerson(db, eventId, { firstName: "Léa" });
      const hugo = await seedPerson(db, eventId, { firstName: "Hugo" }, lea.token);

      const result = await whileHeld(
        db,
        (trx) => deleteSeededPerson(trx, eventId, hugo.id),
        (own) => takeSeats(own, eventId, lea.token, rideId, "aller", [lea.id, hugo.id]),
      );

      expect(result).toMatchObject({ ok: false, error: "personGone", goneIds: [hugo.id] });
      expect(await placementsOf(db, eventId)).toEqual([]);
    });
  });

  /** Léa (without a car before) and Inès (not concerned before), of one device, took seats in r1. */
  async function seatedScene(db: Db) {
    const scene = await seedScene(db);
    const { eventId, lea, ines, r1 } = scene;
    expect(await takeSeats(db, eventId, lea.token, r1, "aller", [lea.id, ines.id])).toMatchObject({ ok: true });
    const undo = [
      { personId: lea.id, before: "withoutCar" },
      { personId: ines.id, before: "notConcerned" },
    ];
    return { ...scene, undo };
  }

  it("C7.4: undoSeats leaves out a person gone, and gives the others their state before", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, ines, r1, undo } = await seatedScene(trx);
      await deleteSeededPerson(trx, eventId, ines.id);

      const result = await undoSeats(trx, eventId, lea.token, r1, "aller", undo);

      expect(result).toEqual({ ok: true, undoneIds: [lea.id], state: await readEventState(trx, eventId, lea.token) });
      expect(passengersOf(result, "aller", r1)).toEqual([]);
    });
  });

  it("C7.4: with everybody asked gone, undoSeats succeeds and undoes nobody (Seat.alreadyOut)", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, ines, r1, undo } = await seatedScene(trx);
      await deleteSeededPerson(trx, eventId, lea.id);
      await deleteSeededPerson(trx, eventId, ines.id);

      const result = await undoSeats(trx, eventId, lea.token, r1, "aller", undo);

      expect(result).toEqual({ ok: true, undoneIds: [], state: await readEventState(trx, eventId, lea.token) });
    });
  });

  it("C7.3: a person of another device among them is given back too, the gone one aside", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, ines, tom, r1, undo } = await seatedScene(trx);
      await seedPlacement(trx, { personId: tom.id, eventId, leg: "aller", rideId: r1 });
      await deleteSeededPerson(trx, eventId, ines.id);
      const asked = [...undo, { personId: tom.id, before: "withoutCar" }];
      expect(await undoSeats(trx, eventId, lea.token, r1, "aller", asked)).toMatchObject({
        ok: true,
        undoneIds: [lea.id, tom.id],
      });
    });
  });
});

/** Where each person of the aller boards: the Stop of her Placement, `null` at the Ride's start. */
async function boardingOf(db: Db, eventId: string): Promise<Record<string, string | null>> {
  const rows = await db
    .selectFrom("placement")
    .select(["person_id", "stop_id"])
    .where("event_id", "=", eventId)
    .where("leg", "=", "aller")
    .execute();
  return Object.fromEntries(rows.map((row) => [row.person_id, row.stop_id]));
}

/** What the organiser's write does to a Ride's Stop: the Ride's lock first, then the delete. */
async function removeStopUnderRide(db: Db, eventId: string, rideId: string, stopId: string): Promise<void> {
  await atomically(db, async (trx) => {
    await lockRide(trx, { id: rideId, eventId, leg: "aller" });
    await trx.deleteFrom("stop").where("id", "=", stopId).execute();
  });
}

// RV3.3 to RV3.5: a seat taken at a meeting point of the aller.
describe("takeSeats at a stop", () => {
  it("RV3.3: places two persons at the second point in one write, and at the start without a point", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, hugo, ines, r1 } = await seedScene(trx);
      await seedStop(trx, eventId, r1, { time: "07:10:00" });
      const second = await seedStop(trx, eventId, r1, { time: "07:20:00" });

      const result = await takeSeats(trx, eventId, lea.token, r1, "aller", [lea.id, hugo.id], second);

      expect(result).toEqual({ ok: true, state: await readEventState(trx, eventId, lea.token) });
      expect(await boardingOf(trx, eventId)).toMatchObject({ [lea.id]: second, [hugo.id]: second });
      expect(await takeSeats(trx, eventId, lea.token, r1, "aller", [ines.id])).toMatchObject({ ok: true });
      expect((await boardingOf(trx, eventId))[ines.id]).toBeNull();
    });
  });

  it("RV3.3: null is the start, as no point is", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, r1 } = await seedScene(trx);
      await seedStop(trx, eventId, r1);
      expect(await takeSeats(trx, eventId, lea.token, r1, "aller", [lea.id], null)).toEqual({
        ok: true,
        state: await readEventState(trx, eventId, lea.token),
      });
      expect((await boardingOf(trx, eventId))[lea.id]).toBeNull();
    });
  });

  it.each([
    ["a number", 42],
    ["a word", "Mairie"],
    ["an empty string", ""],
  ])("refuses %s as a point as invalid, and writes nothing", async (_, stopId) => {
    await withRollback(async (trx) => {
      const { eventId, lea, r1 } = await seedScene(trx);
      const before = await placementsOf(trx, eventId);
      const result = await takeSeats(trx, eventId, lea.token, r1, "aller", [lea.id], stopId);
      expect(result).toMatchObject({ ok: false, error: "invalid" });
      expect(await placementsOf(trx, eventId)).toEqual(before);
    });
  });

  it("RV3.4: a point deleted before the send puts the persons at the start, with stopGone, and no seat is lost", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, hugo, r1 } = await seedScene(trx);
      const stop = await seedStop(trx, eventId, r1);
      await trx.deleteFrom("stop").where("id", "=", stop).execute();

      const result = await takeSeats(trx, eventId, lea.token, r1, "aller", [lea.id, hugo.id], stop);

      expect(result).toEqual({ ok: true, stopGone: true, state: await readEventState(trx, eventId, lea.token) });
      expect(await boardingOf(trx, eventId)).toMatchObject({ [lea.id]: null, [hugo.id]: null });
      expect(await ridePassengers(trx, { id: r1, eventId, leg: "aller" })).toHaveLength(2);
    });
  });

  it("RV3.4: everyone asked already in the car: nothing is written, the point asked is ignored and no stopGone is said", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, r1 } = await seedScene(trx);
      const stop = await seedStop(trx, eventId, r1);
      await trx.deleteFrom("stop").where("id", "=", stop).execute();
      expect(await takeSeats(trx, eventId, lea.token, r1, "aller", [lea.id], null)).toMatchObject({ ok: true });
      const before = await placementsOf(trx, eventId);

      const result = await takeSeats(trx, eventId, lea.token, r1, "aller", [lea.id], stop);

      expect(result).toEqual({ ok: true, state: await readEventState(trx, eventId, lea.token) });
      expect(await placementsOf(trx, eventId)).toEqual(before);
    });
  });

  it("RV8.3: with the option off, a point is refused by stopsOff and nothing is written; no point is a seat as before", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, hugo, r1 } = await seedScene(trx);
      const stop = await seedStop(trx, eventId, r1);
      await trx.updateTable("event").set({ stops_enabled: false }).where("id", "=", eventId).execute();
      const before = await placementsOf(trx, eventId);

      const refused = await takeSeats(trx, eventId, lea.token, r1, "aller", [lea.id], stop);

      expect(refused).toMatchObject({ ok: false, error: "stopsOff" });
      expect(await placementsOf(trx, eventId)).toEqual(before);
      expect(await takeSeats(trx, eventId, lea.token, r1, "aller", [lea.id, hugo.id], null)).toEqual({
        ok: true,
        state: await readEventState(trx, eventId, lea.token),
      });
    });
  });

  it("RV3.4: a point of another car is no point of this one", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, r1, r2 } = await seedScene(trx);
      const elsewhere = await seedStop(trx, eventId, r2);

      const result = await takeSeats(trx, eventId, lea.token, r1, "aller", [lea.id], elsewhere);

      expect(result).toMatchObject({ ok: true, stopGone: true });
      expect((await boardingOf(trx, eventId))[lea.id]).toBeNull();
    });
  });

  it("RV3.4: the retour has no points: a point sent for it is gone", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, r3 } = await seedScene(trx);
      const result = await takeSeats(trx, eventId, lea.token, r3, "retour", [lea.id], randomUUID());
      expect(result).toMatchObject({ ok: true, stopGone: true });
    });
  });

  it("RV3.5: alreadyInCar, rideGone and personGone keep their keys with a point, and nobody is placed", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, hugo, tom, r1 } = await seedScene(trx);
      const stop = await seedStop(trx, eventId, r1);
      const before = await placementsOf(trx, eventId);

      const alreadyInCar = await takeSeats(trx, eventId, tom.token, r1, "aller", [tom.id], stop);
      expect(alreadyInCar).toMatchObject({ ok: false, error: "alreadyInCar" });
      const rideGone = await takeSeats(trx, eventId, lea.token, randomUUID(), "aller", [lea.id], stop);
      expect(rideGone).toMatchObject({ ok: false, error: "rideGone" });
      expect(await placementsOf(trx, eventId)).toEqual(before);

      await deleteSeededPerson(trx, eventId, hugo.id);
      const personGone = await takeSeats(trx, eventId, lea.token, r1, "aller", [lea.id, hugo.id], stop);
      expect(personGone).toMatchObject({ ok: false, error: "personGone", goneIds: [hugo.id] });
      expect((await boardingOf(trx, eventId))[lea.id]).toBeNull();
    });
  });

  it("RV3.5: notEnoughSeats and seatTaken are kept with a point, and nobody is placed by the refusal", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, hugo, ines } = await seedScene(trx);
      const paul = await seedPerson(trx, eventId, { firstName: "Paul" });
      const small = await seedRide(trx, eventId, paul.id, { leg: "aller", seats: 1 });
      const stop = await seedStop(trx, eventId, small);

      const two = await takeSeats(trx, eventId, lea.token, small, "aller", [lea.id, hugo.id], stop);
      expect(two).toMatchObject({ ok: false, error: "notEnoughSeats", freeSeats: 1 });
      expect((await boardingOf(trx, eventId))[hugo.id]).toBeNull();
      expect((await ridePassengers(trx, { id: small, eventId, leg: "aller" })).length).toBe(0);

      expect(await takeSeats(trx, eventId, lea.token, small, "aller", [lea.id], stop)).toMatchObject({ ok: true });
      const taken = await takeSeats(trx, eventId, lea.token, small, "aller", [ines.id], stop);
      expect(taken).toMatchObject({ ok: false, error: "seatTaken" });
      expect(await ridePassengers(trx, { id: small, eventId, leg: "aller" })).toHaveLength(1);
    });
  });

  it("eventEnded comes before every other refusal, with a point", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, r1 } = await seedScene(trx);
      const stop = await seedStop(trx, eventId, r1);
      await anonymiseEvent(trx, eventId);
      expect(await takeSeats(trx, eventId, lea.token, r1, "aller", [lea.id], stop)).toMatchObject({ error: "eventEnded" });
      expect(await takeSeats(trx, eventId, NOBODYS_TOKEN, randomUUID(), "aller", [lea.id], stop)).toMatchObject({
        error: "eventEnded",
      });
    });
  });

  // Committed data, both orders: the Stop is deleted under the Ride's lock, or chosen under it.
  describe("at the same time as the Stop's deletion, on committed data", () => {
    async function aCarWithStop(db: Db, eventId: string) {
      await db.updateTable("event").set({ stops_enabled: true }).where("id", "=", eventId).execute();
      const driver = await seedPerson(db, eventId, { firstName: "Marc" });
      const rideId = await seedRide(db, eventId, driver.id, { seats: 3 });
      return { rideId, stopId: await seedStop(db, eventId, rideId) };
    }

    it("RV3.4: a Stop deleted while the take waits for the Ride gives stopGone, at the start, never failed", async () => {
      await withCommittedEvent(async (db, eventId) => {
        const { rideId, stopId } = await aCarWithStop(db, eventId);
        const lea = await seedPerson(db, eventId, { firstName: "Léa" });

        const second = await whileHeld(
          db,
          (trx) => removeStopUnderRide(trx, eventId, rideId, stopId),
          (own) => takeSeats(own, eventId, lea.token, rideId, "aller", [lea.id], stopId),
        );

        expect(second).toMatchObject({ ok: true, stopGone: true });
        expect(await boardingOf(db, eventId)).toEqual({ [lea.id]: null });
      });
    });

    it("RV3.4: a Stop taken first, then deleted under the Ride's lock, leaves the person at the start, never 23503", async () => {
      await withCommittedEvent(async (db, eventId) => {
        const { rideId, stopId } = await aCarWithStop(db, eventId);
        const lea = await seedPerson(db, eventId, { firstName: "Léa" });

        await whileHeld(
          db,
          (trx) => takeSeats(trx, eventId, lea.token, rideId, "aller", [lea.id], stopId),
          (own) => removeStopUnderRide(own, eventId, rideId, stopId),
          // The point was written in the first, which waits: a take that writes none would end the same.
          async (_pid, trx) => {
            expect(await boardingOf(trx, eventId)).toEqual({ [lea.id]: stopId });
          },
        );

        expect(await boardingOf(db, eventId)).toEqual({ [lea.id]: null });
        expect(await ridePassengers(db, { id: rideId, eventId, leg: "aller" })).toHaveLength(1);
      });
    });
  });
});
