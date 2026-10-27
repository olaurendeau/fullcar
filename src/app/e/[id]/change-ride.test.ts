import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { setPlacement } from "@/db/placements";
import { ridePassengers } from "@/db/rides";
import type { Database } from "@/db/schema";
import { whileHeld, withCommittedEvent } from "@/db/test-committed";
import { withRollback } from "@/db/test-db";
import { removeSeededRetour, seedEvent } from "@/db/test-events";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import type { Leg } from "@/domain/leg";
import { removeRide, updateRide } from "./change-ride";
import { readEventState, type DeviceState, type EventState } from "./event-state";
import { stillOpen } from "./test-state";

type Db = Kysely<Database>;

/** A connection that fails the test as soon as anything reaches for it. */
const untouchable = new Proxy({} as Db, {
  get(_, property) {
    throw new Error(`the database was used (${String(property)})`);
  },
});

/** Well-formed (22 base64url characters, the last one canonical), and held by nobody. */
const NOBODYS_TOKEN = "AAAAAAAAAAAAAAAAAAAAAA";

/** What every write action gives for an unknown event (decision on #135 and #138). */
const EVENT_NOT_FOUND = { ok: false, error: "eventNotFound" };

/** A point chosen among the suggestions, as the database keeps it. */
const VAUGNERAY = { lat: 45.73711, lng: 4.65622 };
const GARE = { lat: 45.73498, lng: 4.66012 };

/**
 * Aller: Marc drives r1 (3 seats, at the position of Vaugneray) with Léa then Hugo, Tom is without a car. Retour: Marc
 * drives r2 with Léa. Léa and Hugo are the persons of one device; Marc and Tom each have
 * their own.
 */
async function seedScene(db: Db) {
  const { id: eventId } = await seedEvent(db);
  const marc = await seedPerson(db, eventId, { firstName: "Marc" });
  const lea = await seedPerson(db, eventId, { firstName: "Léa" });
  const hugo = await seedPerson(db, eventId, { firstName: "Hugo" }, lea.token);
  const tom = await seedPerson(db, eventId, { firstName: "Tom" });
  const r1 = await seedRide(db, eventId, marc.id, { leg: "aller", seats: 3, position: VAUGNERAY });
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
    .select(["id", "leg", "driver_id", "location", "departure_time", "seats", "note", "location_lat", "location_lng"])
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

/** Where a Ride is, as the database holds it. */
async function positionOf(db: Db, rideId: string) {
  return db.selectFrom("ride").select(["location_lat", "location_lng"]).where("id", "=", rideId).executeTakeFirstOrThrow();
}

/** The columns of a position. */
function columns(position: { lat: number; lng: number } | null) {
  return { location_lat: position?.lat ?? null, location_lng: position?.lng ?? null };
}

/** The state a result gives, if it gives one. */
function stateOf(result: object): EventState | undefined {
  return "state" in result ? (result.state as EventState) : undefined;
}

function carOf(state: DeviceState | undefined, leg: Leg, rideId: string) {
  return stillOpen(state)?.legs.find((board) => board.leg === leg)?.cars.find((car) => car.id === rideId);
}

function legOf(state: DeviceState | undefined, leg: Leg) {
  const board = stillOpen(state)?.legs.find((found) => found.leg === leg);
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
      const car = carOf(stateOf(result), "aller", r1);
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
      const state = stateOf(result);
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

  it("C8.2: a field left out stays as it is, so that a change does not undo another made since the form showed", async () => {
    await withRollback(async (trx) => {
      const { eventId, marc, lea, hugo, r1 } = await seedScene(trx);
      await updateRide(trx, eventId, marc.token, r1, "aller", form({ note: "Coffre plein" }));
      const lists = { seenPassengerIds: [lea.id, hugo.id], leaving: [] };

      const result = await updateRide(trx, eventId, marc.token, r1, "aller", { location: "Gare de Cesson", ...lists });

      expect(result).toMatchObject({ ok: true });
      const car = carOf(stateOf(result), "aller", r1);
      expect(car).toMatchObject({ location: "Gare de Cesson", departureTime: "07:15:00", note: "Coffre plein", seats: 3 });
      // Nothing to change: a success, and the car as it was.
      const again = await updateRide(trx, eventId, marc.token, r1, "aller", lists);
      expect(again).toMatchObject({ ok: true });
      expect(carOf(stateOf(again), "aller", r1)).toEqual(car);
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
    // AL6.4: a position that is not one, or without its place.
    ["a position without its place", ({ r1 }) => [r1, "aller", form({ location: undefined, position: GARE })]],
    ["a null position without its place", ({ r1 }) => [r1, "aller", form({ location: undefined, position: null })]],
    ["a position that is not an object", ({ r1 }) => [r1, "aller", form({ position: "45.7,4.6" })]],
    ["a position without a longitude", ({ r1 }) => [r1, "aller", form({ position: { lat: 45.7 } })]],
    ["a position with a latitude as text", ({ r1 }) => [r1, "aller", form({ position: { lat: "45.7", lng: 4.6 } })]],
    ["a latitude above 90", ({ r1 }) => [r1, "aller", form({ position: { lat: 90.1, lng: 4.6 } })]],
    ["a latitude below -90", ({ r1 }) => [r1, "aller", form({ position: { lat: -90.1, lng: 4.6 } })]],
    ["a longitude above 180", ({ r1 }) => [r1, "aller", form({ position: { lat: 45.7, lng: 180.1 } })]],
    ["a longitude below -180", ({ r1 }) => [r1, "aller", form({ position: { lat: 45.7, lng: -180.1 } })]],
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

  it("gives eventNotFound for an unknown event, and never looks up a malformed id", async () => {
    await withRollback(async (trx) => {
      const { marc, r1 } = await seedScene(trx);
      expect(await updateRide(trx, "Zz9yXw8v", marc.token, r1, "aller", form())).toEqual(EVENT_NOT_FOUND);
    });
    expect(await updateRide(untouchable, "Ab3dEf70", NOBODYS_TOKEN, randomUUID(), "aller", form())).toEqual(
      EVENT_NOT_FOUND,
    );
  });

  it("on the connection, commits the change, then gives the state read after the commit", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const marc = await seedPerson(db, eventId, { firstName: "Marc" });
      const rideId = await seedRide(db, eventId, marc.id);
      const result = await updateRide(db, eventId, marc.token, rideId, "aller", form({ seats: "6" }));
      expect(carOf(stateOf(result), "aller", rideId)?.seats).toBe(6);
      expect((await rowsOf(db, eventId)).rides).toEqual([expect.objectContaining({ id: rideId, seats: 6 })]);
    });
  });
});

describe("updateRide, the position of the place", () => {
  const lists = { seenPassengerIds: [], leaving: [] };

  it("AL4.3: a place chosen among the suggestions is written with its position, rounded", async () => {
    await withRollback(async (trx) => {
      const { eventId, marc, r1 } = await seedScene(trx);
      const fields = { location: "Gare de Vaugneray", position: { lat: 45.7349812, lng: 4.6601249 }, ...lists };
      expect(await updateRide(trx, eventId, marc.token, r1, "aller", fields)).toMatchObject({ ok: true });
      expect(await positionOf(trx, r1)).toEqual(columns(GARE));
    });
  });

  it("AL3.6: a place changed with a null position has none", async () => {
    await withRollback(async (trx) => {
      const { eventId, marc, r1 } = await seedScene(trx);
      const fields = { location: "Mairie de Vaugneray", position: null, ...lists };
      expect(await updateRide(trx, eventId, marc.token, r1, "aller", fields)).toMatchObject({ ok: true });
      expect(await positionOf(trx, r1)).toEqual(columns(null));
    });
  });

  it("AL5.3 case 2: the same text with a position is a change, and the position is written", async () => {
    await withRollback(async (trx) => {
      const { eventId, marc, r2 } = await seedScene(trx);
      const fields = { location: "Mairie de Cesson", position: VAUGNERAY, ...lists };
      expect(await updateRide(trx, eventId, marc.token, r2, "retour", fields)).toMatchObject({ ok: true });
      expect(await positionOf(trx, r2)).toEqual(columns(VAUGNERAY));
    });
  });

  it("AL5.6: the place sent without a position keeps it under the same text", async () => {
    await withRollback(async (trx) => {
      const { eventId, marc, r1 } = await seedScene(trx);
      const fields = { location: " Mairie de Cesson ", note: "Coffre plein", ...lists };
      expect(await updateRide(trx, eventId, marc.token, r1, "aller", fields)).toMatchObject({ ok: true });
      expect(await positionOf(trx, r1)).toEqual(columns(VAUGNERAY));
    });
  });

  it("AL5.6: the place sent without a position, under another text, has none", async () => {
    await withRollback(async (trx) => {
      const { eventId, marc, r1 } = await seedScene(trx);
      const fields = { location: "Gare de Cesson", ...lists };
      expect(await updateRide(trx, eventId, marc.token, r1, "aller", fields)).toMatchObject({ ok: true });
      expect(await positionOf(trx, r1)).toEqual(columns(null));
      expect((await rowsOf(trx, eventId)).rides).toContainEqual(expect.objectContaining({ id: r1, location: "Gare de Cesson" }));
    });
  });

  it("C8.2: a change that leaves the place out leaves its position as it is", async () => {
    await withRollback(async (trx) => {
      const { eventId, marc, r1 } = await seedScene(trx);
      expect(await updateRide(trx, eventId, marc.token, r1, "aller", { seats: "4", ...lists })).toMatchObject({ ok: true });
      expect(await positionOf(trx, r1)).toEqual(columns(VAUGNERAY));
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
      const aller = legOf(stateOf(result), "aller");
      expect(aller.cars).toEqual([]);
      expect(aller.withoutCar.map((person) => person.firstName).sort()).toEqual(["Hugo", "Léa", "Tom"]);
      expect(aller.withoutCar.length).toBe(legOf(before, "aller").withoutCar.length + 2);
      expect(aller.device).toEqual([{ id: marc.id, firstName: "Marc", phone: null, state: { kind: "notConcerned" } }]);
      expect(legOf(stateOf(result), "retour")).toEqual(legOf(before, "retour"));
    });
  });

  it("C8.6: a car without passengers leaves the persons without a car as they were", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const marc = await seedPerson(trx, eventId, { firstName: "Marc" });
      const rideId = await seedRide(trx, eventId, marc.id);
      const result = await removeRide(trx, eventId, marc.token, rideId, "aller");
      expect(legOf(stateOf(result), "aller")).toMatchObject({ cars: [], withoutCar: [] });
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

  it("gives eventNotFound for an unknown event, and never looks up a malformed id", async () => {
    await withRollback(async (trx) => {
      const { marc, r1 } = await seedScene(trx);
      expect(await removeRide(trx, "Zz9yXw8v", marc.token, r1, "aller")).toEqual(EVENT_NOT_FOUND);
    });
    expect(await removeRide(untouchable, "Ab3dEf70", NOBODYS_TOKEN, randomUUID(), "aller")).toEqual(EVENT_NOT_FOUND);
  });
});

// Two sessions on committed data: the first holds its transaction open, the second goes
// through updateRide on a connection, as the application does, and must wait for it.
describe("at the same time as another session, on committed data", () => {
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
        (own) => updateRide(own, eventId, marc.token, rideId, "aller", fields),
      );

      expect(result).toMatchObject({ ok: false, error: "passengersChanged", passengerIds: [lea.id, ben.id, chloe.id] });
      const car = carOf(stateOf(result), "aller", rideId);
      expect(car?.passengers.map((person) => person.firstName)).toEqual(["Léa", "Ben", "Chloé"]);
      expect((await rowsOf(db, eventId)).rides).toEqual([expect.objectContaining({ id: rideId, seats: 3 })]);
      const passengers = await ridePassengers(db, { id: rideId, eventId, leg: "aller" });
      expect(passengers.map((passenger) => passenger.personId)).toEqual([lea.id, ben.id, chloe.id]);
    });
  });
});

// M7.11, M7.12, decision 40: the page still shows the retour the organiser removed.
describe("on a retour removed meanwhile", () => {
  it("M7.11: updateRide is refused by noRetour, with the state, before rideGone and forbidden, and nothing is written", async () => {
    await withRollback(async (trx) => {
      const { eventId, marc, r2 } = await seedScene(trx);
      await removeSeededRetour(trx, eventId);
      const before = await rowsOf(trx, eventId);

      const result = await updateRide(trx, eventId, marc.token, r2, "retour", form({ time: "19:00" }));

      expect(result).toEqual({ ok: false, error: "noRetour", state: await readEventState(trx, eventId, marc.token) });
      expect(await updateRide(trx, eventId, NOBODYS_TOKEN, r2, "retour", form())).toMatchObject({ error: "noRetour" });
      expect(await rowsOf(trx, eventId)).toEqual(before);
    });
  });

  it("M7.12: removeRide is refused by noRetour, with the state, and nothing is written", async () => {
    await withRollback(async (trx) => {
      const { eventId, marc, r2 } = await seedScene(trx);
      await removeSeededRetour(trx, eventId);
      const before = await rowsOf(trx, eventId);

      const result = await removeRide(trx, eventId, marc.token, r2, "retour");

      expect(result).toEqual({ ok: false, error: "noRetour", state: await readEventState(trx, eventId, marc.token) });
      expect(await removeRide(trx, eventId, NOBODYS_TOKEN, r2, "retour")).toMatchObject({ error: "noRetour" });
      expect(await rowsOf(trx, eventId)).toEqual(before);
    });
  });
});
