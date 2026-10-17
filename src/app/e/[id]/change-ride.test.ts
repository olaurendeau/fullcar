import { randomUUID } from "node:crypto";
import { sql, type ControlledTransaction, type Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { setPlacement } from "@/db/placements";
import { ridePassengers } from "@/db/rides";
import type { Database } from "@/db/schema";
import { withCommittedEvent } from "@/db/test-committed";
import { withRollback } from "@/db/test-db";
import { seedEvent } from "@/db/test-events";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import type { Leg } from "@/domain/leg";
import type { VisibleBoard } from "@/domain/phone-visibility";
import { removeRide, updateRide } from "./change-ride";
import { readEventState } from "./event-state";

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
 * Aller: Marc drives r1 (3 seats) with Léa then Hugo, Tom is without a car. Retour: Marc
 * drives r2 with Léa. Léa and Hugo are the persons of one device; Marc and Tom each have
 * their own.
 */
async function seedScene(db: Db) {
  const { id: eventId } = await seedEvent(db);
  const marc = await seedPerson(db, eventId, { firstName: "Marc" });
  const lea = await seedPerson(db, eventId, { firstName: "Léa" });
  const hugo = await seedPerson(db, eventId, { firstName: "Hugo" }, lea.token);
  const tom = await seedPerson(db, eventId, { firstName: "Tom" });
  const r1 = await seedRide(db, eventId, marc.id, { leg: "aller", seats: 3 });
  const r2 = await seedRide(db, eventId, marc.id, { leg: "retour", departureTime: "18:30:00" });
  await seedPlacement(db, { personId: lea.id, eventId, leg: "aller", rideId: r1 });
  await seedPlacement(db, { personId: hugo.id, eventId, leg: "aller", rideId: r1 });
  await seedPlacement(db, { personId: tom.id, eventId, leg: "aller", rideId: null });
  await seedPlacement(db, { personId: lea.id, eventId, leg: "retour", rideId: r2 });
  return { eventId, marc, lea, hugo, tom, r1, r2 };
}
type Scene = Awaited<ReturnType<typeof seedScene>>;

/** The fields the form sends, as the card shows them, with nobody leaving. */
function form(fields: Record<string, unknown> = {}) {
  return { location: "Mairie de Cesson", time: "07:15", seats: "3", note: "", seenPassengerIds: [], leaving: [], ...fields };
}

/** Every Ride and Placement of the event: a write that should not happen shows. */
async function rowsOf(db: Db, eventId: string) {
  const rides = await db
    .selectFrom("ride")
    .select(["id", "leg", "driver_id", "location", "departure_time", "seats", "note"])
    .where("event_id", "=", eventId)
    .orderBy("id")
    .execute();
  const placements = await db
    .selectFrom("placement")
    .select(["person_id", "leg", "ride_id", "placed_at"])
    .where("event_id", "=", eventId)
    .orderBy("person_id")
    .orderBy("leg")
    .execute();
  return { rides, placements };
}

function carOf(state: VisibleBoard | undefined, leg: Leg, rideId: string) {
  return state?.find((board) => board.leg === leg)?.cars.find((car) => car.id === rideId);
}

function legOf(state: VisibleBoard | undefined, leg: Leg) {
  const board = state?.find((found) => found.leg === leg);
  if (board === undefined) throw new Error(`no ${leg} in the state`);
  return board;
}

/** The five tokens of C2.4 that are not the driver's, and Léa's, a passenger's (C8.1). */
const NOT_THE_DRIVERS: [string, (scene: Scene, other: Scene) => unknown][] = [
  ["a passenger's token", ({ lea }) => lea.token],
  ["the driver's token for another event", (_, other) => other.marc.token],
  ["no token", () => undefined],
  ["a well-formed token nobody holds", () => NOBODYS_TOKEN],
  ["a malformed token", () => "AAAA"],
];

describe("updateRide", () => {
  it("C8.2: changes the place, the time, the note and the seats; more seats give more free seats", async () => {
    await withRollback(async (trx) => {
      const { eventId, marc, r1 } = await seedScene(trx);
      expect(carOf(await readEventState(trx, eventId, marc.token), "aller", r1)?.freeSeats).toBe(1);

      const fields = form({ location: " Gare de Cesson ", time: "08:05", seats: "5", note: "Coffre plein" });
      const result = await updateRide(trx, eventId, marc.token, r1, "aller", fields);

      expect(result).toEqual({ ok: true, state: await readEventState(trx, eventId, marc.token) });
      const car = carOf(result && "state" in result ? result.state : undefined, "aller", r1);
      expect(car).toMatchObject({ location: "Gare de Cesson", departureTime: "08:05:00", note: "Coffre plein", seats: 5 });
      expect(car?.freeSeats).toBe(3);
      expect(car?.passengers.map((person) => person.firstName).sort()).toEqual(["Hugo", "Léa"]);
    });
  });

  it("C8.3, C3.5: goes down to the number of passengers directly, and leaves everything else as it was", async () => {
    await withRollback(async (trx) => {
      const { eventId, marc, r1 } = await seedScene(trx);
      const before = await rowsOf(trx, eventId);

      const result = await updateRide(trx, eventId, marc.token, r1, "aller", form({ seats: "2" }));

      expect(result).toMatchObject({ ok: true });
      const after = await rowsOf(trx, eventId);
      expect(after.placements).toEqual(before.placements);
      expect(after.rides).toEqual(before.rides.map((ride) => (ride.id === r1 ? { ...ride, seats: 2 } : ride)));
    });
  });

  it("C8.4, C3.5: those chosen to leave are without a car on the leg, the others stay, the retour is untouched", async () => {
    await withRollback(async (trx) => {
      const { eventId, marc, lea, hugo, r1 } = await seedScene(trx);
      const before = await rowsOf(trx, eventId);
      const fields = form({ seats: "1", seenPassengerIds: [lea.id, hugo.id], leaving: [hugo.id] });

      const result = await updateRide(trx, eventId, marc.token, r1, "aller", fields);

      expect(result).toMatchObject({ ok: true });
      const state = result && "state" in result ? result.state : undefined;
      expect(carOf(state, "aller", r1)?.passengers.map((person) => person.firstName)).toEqual(["Léa"]);
      expect(legOf(state, "aller").withoutCar.map((person) => person.firstName).sort()).toEqual(["Hugo", "Tom"]);
      const after = await rowsOf(trx, eventId);
      expect(after.placements.find((row) => row.person_id === hugo.id && row.leg === "aller")?.ride_id).toBeNull();
      const untouched = (rows: typeof before.placements) =>
        rows.filter((row) => !(row.person_id === hugo.id && row.leg === "aller"));
      expect(untouched(after.placements)).toEqual(untouched(before.placements));
    });
  });

  it.each<[string, (scene: Scene) => string[]]>([
    ["nobody", () => []],
    ["one too many", ({ lea, hugo }) => [lea.id, hugo.id]],
    ["someone who is not a passenger", ({ tom }) => [tom.id]],
  ])("C8.4: refuses %s leaving, as passengersChanged, and nothing changes", async (_, leaving) => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      const { eventId, marc, lea, hugo, r1 } = scene;
      const before = await rowsOf(trx, eventId);
      const fields = form({ seats: "1", seenPassengerIds: [lea.id, hugo.id], leaving: leaving(scene) });

      const result = await updateRide(trx, eventId, marc.token, r1, "aller", fields);

      expect(result).toEqual({
        ok: false,
        error: "passengersChanged",
        // Seeded in one transaction, they boarded at the same now(): in id order.
        passengerIds: [lea.id, hugo.id].sort(),
        state: await readEventState(trx, eventId, marc.token),
      });
      expect(await rowsOf(trx, eventId)).toEqual(before);
    });
  });

  it("C4.7: refuses fields against the rules of R4, with an error per field, and nothing changes", async () => {
    await withRollback(async (trx) => {
      const { eventId, marc, r1 } = await seedScene(trx);
      const before = await rowsOf(trx, eventId);
      const result = await updateRide(trx, eventId, marc.token, r1, "aller", form({ location: " ", seats: "9" }));
      expect(result).toEqual({ ok: false, errors: { location: "required", seats: "outOfRange" }, first: "location" });
      expect(await rowsOf(trx, eventId)).toEqual(before);
    });
  });

  describe("C8.1: refuses another token than the driver's, and nothing changes", () => {
    it.each(NOT_THE_DRIVERS)("%s", async (_, tokenOf) => {
      await withRollback(async (trx) => {
        const scene = await seedScene(trx);
        const other = await seedScene(trx);
        const before = await rowsOf(trx, scene.eventId);
        const token = tokenOf(scene, other);
        const fields = form({ seats: "1", seenPassengerIds: [scene.lea.id, scene.hugo.id], leaving: [scene.hugo.id] });

        const result = await updateRide(trx, scene.eventId, token, scene.r1, "aller", fields);

        expect(result).toEqual({ ok: false, error: "forbidden", state: await readEventState(trx, scene.eventId, token) });
        expect(await rowsOf(trx, scene.eventId)).toEqual(before);
      });
    });
  });

  it.each<[string, (scene: Scene) => [unknown, unknown, unknown]]>([
    ["a ride id that is not a creation id", () => [42, "aller", form()]],
    ["an unknown leg", ({ r1 }) => [r1, "lundi", form()]],
    ["no fields", ({ r1 }) => [r1, "aller", undefined]],
    ["no passengers seen", ({ r1 }) => [r1, "aller", form({ seenPassengerIds: undefined })]],
    ["passengers seen that are not a list", ({ r1, lea }) => [r1, "aller", form({ seenPassengerIds: lea.id })]],
    ["no one leaving", ({ r1 }) => [r1, "aller", form({ leaving: undefined })]],
    ["someone leaving who is not a creation id", ({ r1 }) => [r1, "aller", form({ seats: "1", leaving: ["Hugo"] })]],
  ])("refuses %s as invalid, and nothing changes", async (_, request) => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      const before = await rowsOf(trx, scene.eventId);
      const [rideId, leg, fields] = request(scene);

      const result = await updateRide(trx, scene.eventId, scene.marc.token, rideId, leg, fields);

      expect(result).toEqual({
        ok: false,
        error: "invalid",
        state: await readEventState(trx, scene.eventId, scene.marc.token),
      });
      expect(await rowsOf(trx, scene.eventId)).toEqual(before);
    });
  });

  it.each<[string, (scene: Scene) => [string, Leg]]>([
    ["a car of the other leg", ({ r2 }) => [r2, "aller"]],
    ["a car never offered", () => [randomUUID(), "aller"]],
  ])("refuses %s as rideGone, and nothing changes", async (_, request) => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      const before = await rowsOf(trx, scene.eventId);
      const [rideId, leg] = request(scene);
      const result = await updateRide(trx, scene.eventId, scene.marc.token, rideId, leg, form());
      expect(result).toMatchObject({ ok: false, error: "rideGone" });
      expect(await rowsOf(trx, scene.eventId)).toEqual(before);
    });
  });

  it("gives nothing for an unknown event, and never looks up a malformed id", async () => {
    await withRollback(async (trx) => {
      const { marc, r1 } = await seedScene(trx);
      expect(await updateRide(trx, "Zz9yXw8v", marc.token, r1, "aller", form())).toBeUndefined();
    });
    expect(await updateRide(untouchable, "Ab3dEf70", NOBODYS_TOKEN, randomUUID(), "aller", form())).toBeUndefined();
  });

  it("on the connection, commits the change, then gives the state read after the commit", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const marc = await seedPerson(db, eventId, { firstName: "Marc" });
      const rideId = await seedRide(db, eventId, marc.id);
      const result = await updateRide(db, eventId, marc.token, rideId, "aller", form({ seats: "6" }));
      expect(carOf(result && "state" in result ? result.state : undefined, "aller", rideId)?.seats).toBe(6);
      expect((await rowsOf(db, eventId)).rides).toEqual([expect.objectContaining({ id: rideId, seats: 6 })]);
    });
  });
});

describe("removeRide", () => {
  it("C8.6, C3.5: the passengers are without a car, the driver is not concerned, the retour is identical", async () => {
    await withRollback(async (trx) => {
      const { eventId, marc, r1 } = await seedScene(trx);
      const before = await readEventState(trx, eventId, marc.token);

      const result = await removeRide(trx, eventId, marc.token, r1, "aller");

      expect(result).toEqual({ ok: true, state: await readEventState(trx, eventId, marc.token) });
      const aller = legOf(result?.state, "aller");
      expect(aller.cars).toEqual([]);
      expect(aller.withoutCar.map((person) => person.firstName).sort()).toEqual(["Hugo", "Léa", "Tom"]);
      expect(aller.withoutCar.length).toBe(legOf(before, "aller").withoutCar.length + 2);
      expect(aller.device).toEqual([{ id: marc.id, firstName: "Marc", phone: null, state: { kind: "notConcerned" } }]);
      expect(legOf(result?.state, "retour")).toEqual(legOf(before, "retour"));
    });
  });

  it("C8.6: a car without passengers leaves the persons without a car as they were", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const marc = await seedPerson(trx, eventId, { firstName: "Marc" });
      const rideId = await seedRide(trx, eventId, marc.id);
      const result = await removeRide(trx, eventId, marc.token, rideId, "aller");
      expect(legOf(result?.state, "aller")).toMatchObject({ cars: [], withoutCar: [] });
    });
  });

  it("removing a car already removed succeeds, and changes nothing", async () => {
    await withRollback(async (trx) => {
      const { eventId, marc, r1 } = await seedScene(trx);
      await removeRide(trx, eventId, marc.token, r1, "aller");
      const before = await rowsOf(trx, eventId);
      expect(await removeRide(trx, eventId, marc.token, r1, "aller")).toEqual({
        ok: true,
        state: await readEventState(trx, eventId, marc.token),
      });
      expect(await rowsOf(trx, eventId)).toEqual(before);
    });
  });

  it("naming a car of the other leg removes nothing", async () => {
    await withRollback(async (trx) => {
      const { eventId, marc, r2 } = await seedScene(trx);
      const before = await rowsOf(trx, eventId);
      expect(await removeRide(trx, eventId, marc.token, r2, "aller")).toMatchObject({ ok: true });
      expect(await rowsOf(trx, eventId)).toEqual(before);
    });
  });

  describe("C8.1: refuses another token than the driver's, and nothing changes", () => {
    it.each(NOT_THE_DRIVERS)("%s", async (_, tokenOf) => {
      await withRollback(async (trx) => {
        const scene = await seedScene(trx);
        const other = await seedScene(trx);
        const before = await rowsOf(trx, scene.eventId);
        const token = tokenOf(scene, other);

        const result = await removeRide(trx, scene.eventId, token, scene.r1, "aller");

        expect(result).toEqual({ ok: false, error: "forbidden", state: await readEventState(trx, scene.eventId, token) });
        expect(await rowsOf(trx, scene.eventId)).toEqual(before);
      });
    });
  });

  it.each<[string, (scene: Scene) => [unknown, unknown]]>([
    ["a ride id that is not a creation id", () => ["r1", "aller"]],
    ["an unknown leg", ({ r1 }) => [r1, undefined]],
  ])("refuses %s as invalid, and nothing changes", async (_, request) => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      const before = await rowsOf(trx, scene.eventId);
      const [rideId, leg] = request(scene);
      expect(await removeRide(trx, scene.eventId, scene.marc.token, rideId, leg)).toMatchObject({
        ok: false,
        error: "invalid",
      });
      expect(await rowsOf(trx, scene.eventId)).toEqual(before);
    });
  });

  it("gives nothing for an unknown event, and never looks up a malformed id", async () => {
    await withRollback(async (trx) => {
      const { marc, r1 } = await seedScene(trx);
      expect(await removeRide(trx, "Zz9yXw8v", marc.token, r1, "aller")).toBeUndefined();
    });
    expect(await removeRide(untouchable, "Ab3dEf70", NOBODYS_TOKEN, randomUUID(), "aller")).toBeUndefined();
  });
});

// Two sessions on committed data: the first holds its transaction open, the second goes
// through updateRide on the connection, as the application does, and must wait for it.
describe("at the same time as another session, on committed data", () => {
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
    const holder = await db.startTransaction().execute();
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

  // C12.11: this passes only because updateRide locks the Ride before it counts the
  // passengers. Counting first, it would see Léa and Ben, accept Ben leaving, and leave
  // Chloé in a car of one seat with Léa.
  it("C8.5, C12.11: a seat taken between the step and the write refuses the reduction, and gives the passengers now", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const marc = await seedPerson(db, eventId, { firstName: "Marc" });
      const lea = await seedPerson(db, eventId, { firstName: "Léa" });
      const ben = await seedPerson(db, eventId, { firstName: "Ben" });
      const chloe = await seedPerson(db, eventId, { firstName: "Chloé" });
      const rideId = await seedRide(db, eventId, marc.id, { seats: 3 });
      await seedPlacement(db, { personId: lea.id, eventId, leg: "aller", rideId });
      await seedPlacement(db, { personId: ben.id, eventId, leg: "aller", rideId });
      const fields = form({ seats: "1", seenPassengerIds: [lea.id, ben.id], leaving: [ben.id] });

      const result = await whileHeld(
        db,
        (trx) => setPlacement(trx, { personId: chloe.id, eventId, leg: "aller", rideId }),
        () => updateRide(db, eventId, marc.token, rideId, "aller", fields),
      );

      expect(result).toMatchObject({ ok: false, error: "passengersChanged", passengerIds: [lea.id, ben.id, chloe.id] });
      const car = carOf(result && "state" in result ? result.state : undefined, "aller", rideId);
      expect(car?.passengers.map((person) => person.firstName)).toEqual(["Léa", "Ben", "Chloé"]);
      expect((await rowsOf(db, eventId)).rides).toEqual([expect.objectContaining({ id: rideId, seats: 3 })]);
      const passengers = await ridePassengers(db, { id: rideId, eventId, leg: "aller" });
      expect(passengers.map((passenger) => passenger.personId)).toEqual([lea.id, ben.id, chloe.id]);
    });
  });
});
