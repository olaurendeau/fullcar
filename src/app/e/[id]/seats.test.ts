import { randomUUID } from "node:crypto";
import { sql, TableNode, type ControlledTransaction, type Kysely, type KyselyPlugin } from "kysely";
import { describe, expect, it } from "vitest";
import { removePassengers } from "@/db/placements";
import { deleteRide, lockRide, ridePassengers } from "@/db/rides";
import type { Database } from "@/db/schema";
import { withCommittedEvent } from "@/db/test-committed";
import { withRollback } from "@/db/test-db";
import { seedEvent } from "@/db/test-events";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import type { Leg } from "@/domain/leg";
import type { VisibleBoard } from "@/domain/phone-visibility";
import { readEventState } from "./event-state";
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
  const { id: eventId } = await seedEvent(db);
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
  const state = "state" in result ? (result.state as VisibleBoard) : undefined;
  const car = state?.find((board) => board.leg === leg)?.cars.find((found) => found.id === rideId);
  if (car === undefined) throw new Error(`no car ${rideId} on the ${leg} in the state`);
  return car.passengers.map((person) => person.firstName);
}

// Two sessions on committed data: the first holds its transaction open, the second goes
// through the use case on the connection, as the application does, and must wait for it.
async function backendPid(trx: ControlledTransaction<Database>) {
  const { rows } = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(trx);
  return rows[0]!.pid;
}

/** Resolves once some session waits for a lock that the session `pid` holds. */
async function someoneBlockedBy(db: Db, pid: number) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const { rows } = await sql<{ pid: number }>`
      select pid from pg_stat_activity where ${pid}::int = any(pg_blocking_pids(pid))`.execute(db);
    if (rows.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("no session ever waited for the first one");
}

/** `first` in a transaction held open until `second` waits for it, then committed. */
async function whileHeld<T>(db: Db, first: (trx: Db) => Promise<unknown>, second: () => Promise<T>): Promise<T> {
  const holder = await db.startTransaction().setIsolationLevel("repeatable read").execute();
  try {
    await first(holder);
    const pid = await backendPid(holder);
    const pending = second();
    pending.catch(() => {});
    await someoneBlockedBy(db, pid);
    await holder.commit().execute();
    return await pending;
  } finally {
    try {
      await holder.rollback().execute();
    } catch {
      // Already committed: nothing to give back.
    }
  }
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

  describe("C2.4: refuses a person the token did not create, and nothing changes", () => {
    it.each<[string, (scene: Awaited<ReturnType<typeof seedScene>>, otherToken: string) => unknown]>([
      ["the token of another person of the event", ({ tom }) => tom.token],
      ["the token of another event", (_, otherToken) => otherToken],
      ["no token", () => undefined],
      ["a well-formed token nobody holds", () => NOBODYS_TOKEN],
      ["a malformed token", () => "AAAA"],
    ])("%s", async (_, tokenOf) => {
      await withRollback(async (trx) => {
        const scene = await seedScene(trx);
        const other = await seedScene(trx);
        const before = await placementsOf(trx, scene.eventId);
        const token = tokenOf(scene, other.lea.token);

        const result = await takeSeats(trx, scene.eventId, token, scene.r1, "aller", [scene.lea.id]);

        expect(result).toEqual({ ok: false, error: "forbidden", state: await readEventState(trx, scene.eventId, token) });
        expect(await placementsOf(trx, scene.eventId)).toEqual(before);
      });
    });

    it("one person of another device among the device's places nobody", async () => {
      await withRollback(async (trx) => {
        const { eventId, lea, hugo, marc, r1 } = await seedScene(trx);
        const before = await placementsOf(trx, eventId);
        const result = await takeSeats(trx, eventId, lea.token, r1, "aller", [lea.id, hugo.id, marc.id]);
        expect(result).toMatchObject({ ok: false, error: "forbidden" });
        expect(await placementsOf(trx, eventId)).toEqual(before);
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
          () => takeSeats(db, eventId, tom.token, rideId, "aller", [tom.id]),
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
          () => takeSeats(db, eventId, lea.token, rideId, "aller", [lea.id, hugo.id]),
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
          () => takeSeats(db, eventId, lea.token, rideId, "aller", [lea.id]),
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
          () => takeSeats(db, eventId, lea.token, other, "aller", [lea.id]),
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

  describe("C7.3, C2.4: refuses a person the token did not create, and nothing changes", () => {
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
        const before = await placementsOf(trx, scene.eventId);
        const token = tokenOf(scene, other.lea.token);

        const result = await undoSeats(trx, scene.eventId, token, scene.r1, "aller", scene.undo);

        expect(result).toEqual({ ok: false, error: "forbidden", state: await readEventState(trx, scene.eventId, token) });
        expect(await placementsOf(trx, scene.eventId)).toEqual(before);
      });
    });

    it("one person of another device among the device's undoes nobody", async () => {
      await withRollback(async (trx) => {
        const { eventId, lea, tom, r1, undo } = await seatedScene(trx);
        await seedPlacement(trx, { personId: tom.id, eventId, leg: "aller", rideId: r1 });
        const before = await placementsOf(trx, eventId);
        const asked = [...undo, { personId: tom.id, before: "withoutCar" }];
        expect(await undoSeats(trx, eventId, lea.token, r1, "aller", asked)).toMatchObject({ ok: false, error: "forbidden" });
        expect(await placementsOf(trx, eventId)).toEqual(before);
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
          () => undoSeats(db, eventId, lea.token, r1, "aller", undo),
        );

        expect(result).toMatchObject({ ok: true, undoneIds: [ines.id] });
        expect(await standing(db, eventId, "aller")).toEqual({ [lea.id]: r2 });
      });
    });
  });
});
