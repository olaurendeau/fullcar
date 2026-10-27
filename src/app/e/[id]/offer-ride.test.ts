import { randomBytes, randomUUID } from "node:crypto";
import { sql, TableNode, type Kysely, type KyselyPlugin, type QueryId } from "kysely";
import { describe, expect, it } from "vitest";
import { readTokenHolders } from "@/db/persons";
import { findPlacement, setPlacement } from "@/db/placements";
import type { Database } from "@/db/schema";
import { whileHeld, withCommittedEvent } from "@/db/test-committed";
import { withRollback } from "@/db/test-db";
import { seedEvent } from "@/db/test-events";
import { deleteSeededPerson, seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import type { Leg } from "@/domain/leg";
import { PERSONAL_TOKEN_BYTES, personalTokenFromBytes } from "@/domain/personal-token";
import { offerRide as offerRideAction } from "./actions";
import { readEventState } from "./event-state";
import { offerRide, type RideOffer } from "./offer-ride";
import { stillOpen } from "./test-state";

type Db = Kysely<Database>;

function newToken(): string {
  return personalTokenFromBytes(randomBytes(PERSONAL_TOKEN_BYTES));
}

/** What the form sends for a car on `leg`, driven by `driver`. */
function anOffer(leg: Leg, driver: RideOffer["driver"], fields: Partial<RideOffer> = {}): RideOffer {
  const ride = { location: "Gare de Cesson", time: "08:00", seats: "3", note: "" };
  return { rideId: randomUUID(), leg, driver, ...ride, ...fields };
}

function aNewDriver(firstName = "Ana") {
  return { kind: "new" as const, personId: randomUUID(), firstName, phone: "06 44 44 44 44" };
}

/** « Je ramène aussi des personnes » / « J'emmène aussi des personnes »: a second car on the other leg. */
function aDrive(fields: Record<string, unknown> = {}) {
  return { kind: "drive" as const, rideId: randomUUID(), location: "Salle Paul Bert", time: "18:30", ...fields };
}

/** A point chosen among the suggestions, as the database keeps it, and as Photon gives it. */
const VAUGNERAY = { lat: 45.73711, lng: 4.65622 };
const VAUGNERAY_EXACT = { lat: 45.7371141, lng: 4.6562219 };

/** Where a Ride is, as the database holds it; `rideId` as an offer holds it. */
async function positionOf(db: Db, rideId: unknown) {
  const id = String(rideId);
  return db.selectFrom("ride").select(["location_lat", "location_lng"]).where("id", "=", id).executeTakeFirstOrThrow();
}

type Choice = "keep" | "withoutCar" | "notConcerned" | "drive";
type Start = "new" | "notConcerned" | "withoutCar" | "passenger";

/** The number of the persons of a device who offer a car: one is needed to drive (v4.8). */
const DEVICE_PHONE = "06 55 55 55 55";

/**
 * Retour: Marc drives r2, 3 seats. Ana, who offers a car on the aller, is new to the event,
 * or of her device, with a number: without a car on the aller, and on the retour as `start` says.
 */
async function aRetourScene(db: Db, eventId: string, start: Start) {
  const marc = await seedPerson(db, eventId, { firstName: "Marc" });
  const r2 = await seedRide(db, eventId, marc.id, { leg: "retour" });
  if (start === "new") {
    const driver = aNewDriver();
    return { marc, r2, token: newToken(), driver, driverId: driver.personId };
  }
  const ana = await seedPerson(db, eventId, { firstName: "Ana", phone: DEVICE_PHONE });
  await seedPlacement(db, { personId: ana.id, eventId, leg: "aller", rideId: null });
  if (start !== "notConcerned") {
    const rideId = start === "passenger" ? r2 : null;
    await seedPlacement(db, { personId: ana.id, eventId, leg: "retour", rideId });
  }
  return { marc, r2, token: ana.token, driver: { kind: "device" as const, personId: ana.id }, driverId: ana.id };
}

/** Ana's state on the retour after the offer: what she chose, or what she had if she kept it. */
function retourAfter(choice: Choice, start: Start, r2: string, drive: string) {
  if (choice === "drive") return { kind: "driver", rideId: drive };
  if (choice !== "keep") return { kind: choice };
  if (start === "passenger") return { kind: "passenger", rideId: r2 };
  return { kind: start === "new" ? "notConcerned" : start };
}

/**
 * Resolves once `sessions` sessions wait for a lock the session `pid` holds, within 3 s,
 * under Vitest's 5 s. A session queued behind another for the same row waits for that one
 * (its tuple lock), not for `pid`: it counts too.
 */
async function blockedBy(db: Db, pid: number, sessions = 1) {
  for (let attempt = 0; attempt < 120; attempt++) {
    const { rows } = await sql<{ pid: number }>`
      with recursive waiting(pid) as (
        select pid from pg_stat_activity where ${pid}::int = any(pg_blocking_pids(pid))
        union
        select activity.pid from pg_stat_activity activity, waiting
        where waiting.pid = any(pg_blocking_pids(activity.pid))
      )
      select pid from waiting`.execute(db);
    if (rows.length >= sessions) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`fewer than ${sessions} sessions waited for that lock`);
}

/**
 * Aller: Marc drives Léa (r1), Tom is without a car. Retour: Léa and Tom are without a car.
 * Each has their own device, and a number.
 */
async function seedScene(db: Db, eventId: string) {
  const marc = await seedPerson(db, eventId, { firstName: "Marc", phone: "06 11 11 11 11" });
  const lea = await seedPerson(db, eventId, { firstName: "Léa", phone: "06 22 22 22 22" });
  const tom = await seedPerson(db, eventId, { firstName: "Tom", phone: "06 33 33 33 33" });
  const r1 = await seedRide(db, eventId, marc.id, { leg: "aller" });
  await seedPlacement(db, { personId: lea.id, eventId, leg: "aller", rideId: r1 });
  await seedPlacement(db, { personId: lea.id, eventId, leg: "retour", rideId: null });
  await seedPlacement(db, { personId: tom.id, eventId, leg: "aller", rideId: null });
  await seedPlacement(db, { personId: tom.id, eventId, leg: "retour", rideId: null });
  return { eventId, marc, lea, tom, r1 };
}

async function aScene(db: Db) {
  const { id: eventId } = await seedEvent(db);
  return seedScene(db, eventId);
}

/**
 * One device: Ana and Bea without a car on the aller, Cleo not concerned by it, Dan in
 * Marc's car r1 there, Eve driving there; all of them without a car on the retour, and with
 * `DEVICE_PHONE`. Marc and Tom have their own devices.
 */
async function aDeviceScene(db: Db, eventId: string) {
  const token = newToken();
  const marc = await seedPerson(db, eventId, { firstName: "Marc" });
  const tom = await seedPerson(db, eventId, { firstName: "Tom" });
  const r1 = await seedRide(db, eventId, marc.id, { leg: "aller" });
  const device = [];
  for (const firstName of ["Ana", "Bea", "Cleo", "Dan", "Eve"]) {
    device.push(await seedPerson(db, eventId, { firstName, phone: DEVICE_PHONE }, token));
  }
  const [ana, bea, cleo, dan, eve] = device;
  await seedRide(db, eventId, eve.id, { leg: "aller" });
  for (const person of [ana, bea]) await seedPlacement(db, { personId: person.id, eventId, leg: "aller", rideId: null });
  await seedPlacement(db, { personId: dan.id, eventId, leg: "aller", rideId: r1 });
  for (const person of device) await seedPlacement(db, { personId: person.id, eventId, leg: "retour", rideId: null });
  const driver = { kind: "device" as const, personId: ana.id };
  return { token, tom, r1, ana, bea, cleo, dan, eve, driver };
}

function legOf(state: Awaited<ReturnType<typeof readEventState>>, leg: Leg) {
  const found = stillOpen(state)?.legs.find((board) => board.leg === leg);
  if (found === undefined) throw new Error(`no ${leg} in the state`);
  return found;
}

/** Everything an offer may change: the rides, the Placements and the persons of the event. */
async function rowsOf(db: Db, eventId: string) {
  const rides = await db
    .selectFrom("ride")
    .select(["id", "leg", "driver_id"])
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
  const persons = (await readTokenHolders(db, eventId)).map((holder) => holder.id).sort();
  return { rides, placements, persons };
}

/** Claire's number, and the one she sends with her offer. */
const CLAIRE_PHONE = "06 12 34 56 78";
const SENT_PHONE = "07 11 22 33 44";

/** The number a person has in the database: the tests read it, the code never does. */
async function phoneOf(db: Db, personId: string) {
  return (await db.selectFrom("person").select("phone").where("id", "=", personId).executeTakeFirstOrThrow()).phone;
}

/** Claire, of her own device, without a car on both legs, with `phone` when given. */
async function aClaire(db: Db, eventId: string, phone: string | null = null) {
  const claire = await seedPerson(db, eventId, { firstName: "Claire", phone });
  for (const leg of ["aller", "retour"] as const) await seedPlacement(db, { personId: claire.id, eventId, leg, rideId: null });
  return { ...claire, driver: { kind: "device" as const, personId: claire.id } };
}

describe("offerRide", () => {
  it("C4.2, C4.4: a new driver's car is on its leg only, and she is not concerned by the other", async () => {
    await withRollback(async (trx) => {
      const { eventId } = await aScene(trx);
      const token = newToken();
      const driver = aNewDriver();
      const offer = anOffer("retour", driver, { seats: "4", note: "Coffre plein" });

      const result = await offerRide(trx, eventId, token, offer);
      expect(result).toEqual({ ok: true, rideId: offer.rideId, driverId: driver.personId });

      const state = await readEventState(trx, eventId, token);
      expect(legOf(state, "retour").cars).toContainEqual(
        expect.objectContaining({
          id: offer.rideId,
          driver: { id: driver.personId, firstName: "Ana", phone: "06 44 44 44 44" },
          location: "Gare de Cesson",
          departureTime: "08:00:00",
          note: "Coffre plein",
          seats: 4,
          freeSeats: 4,
        }),
      );
      expect(legOf(state, "aller").cars.map((car) => car.id)).not.toContain(offer.rideId);
      const ana = { id: driver.personId, firstName: "Ana", phone: "06 44 44 44 44" };
      expect(legOf(state, "retour").device).toEqual([{ ...ana, state: { kind: "driver", rideId: offer.rideId } }]);
      expect(legOf(state, "aller").device).toEqual([{ ...ana, state: { kind: "notConcerned" } }]);
      // C12.8, and nothing on the other leg either: a new driver has no Placement at all.
      for (const leg of ["aller", "retour"] as const) {
        expect(await findPlacement(trx, { personId: driver.personId, eventId, leg })).toBeUndefined();
      }
    });
  });

  it("C4.5, C12.8: a passenger who becomes a driver frees her seat, and keeps her other leg", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, r1 } = await aScene(trx);
      const offer = anOffer("aller", { kind: "device", personId: lea.id });

      expect(await offerRide(trx, eventId, lea.token, offer)).toMatchObject({ ok: true });

      const aller = legOf(await readEventState(trx, eventId, lea.token), "aller");
      expect(aller.cars.find((car) => car.id === r1)).toMatchObject({ passengers: [], freeSeats: 3 });
      const driving = { id: lea.id, state: { kind: "driver", rideId: offer.rideId } };
      expect(aller.device).toEqual([expect.objectContaining(driving)]);
      expect(await findPlacement(trx, { personId: lea.id, eventId, leg: "aller" })).toBeUndefined();
      expect(await findPlacement(trx, { personId: lea.id, eventId, leg: "retour" })).toEqual({ rideId: null });
    });
  });

  it("C4.5, C12.8: a person without a car who becomes a driver leaves the list", async () => {
    await withRollback(async (trx) => {
      const { eventId, tom } = await aScene(trx);
      const offer = anOffer("aller", { kind: "device", personId: tom.id });

      expect(await offerRide(trx, eventId, tom.token, offer)).toMatchObject({ ok: true });

      const state = await readEventState(trx, eventId, tom.token);
      expect(legOf(state, "aller").withoutCar).toEqual([]);
      expect(legOf(state, "retour").withoutCar.map((person) => person.id)).toContain(tom.id);
      expect(await findPlacement(trx, { personId: tom.id, eventId, leg: "aller" })).toBeUndefined();
    });
  });

  it("C4.6: a second car on the same leg is refused, a car on the other leg is accepted", async () => {
    await withRollback(async (trx) => {
      const { eventId, tom } = await aScene(trx);
      const driver = { kind: "device" as const, personId: tom.id };
      const first = anOffer("aller", driver);
      await offerRide(trx, eventId, tom.token, first);
      const before = await rowsOf(trx, eventId);

      const second = anOffer("aller", driver);
      expect(await offerRide(trx, eventId, tom.token, second)).toEqual({ ok: false, error: "alreadyDriving" });
      expect(await rowsOf(trx, eventId)).toEqual(before);

      const retour = anOffer("retour", driver);
      expect(await offerRide(trx, eventId, tom.token, retour)).toMatchObject({ ok: true });
      const state = await readEventState(trx, eventId, tom.token);
      expect(legOf(state, "aller").device[0].state).toEqual({ kind: "driver", rideId: first.rideId });
      expect(legOf(state, "retour").device[0].state).toEqual({ kind: "driver", rideId: retour.rideId });
    });
  });

  it("C4.10: the same offer sent again creates exactly one car and one person, still of the device", async () => {
    await withRollback(async (trx) => {
      const { eventId } = await aScene(trx);
      const token = newToken();
      const offer = anOffer("aller", aNewDriver());
      const first = await offerRide(trx, eventId, token, offer);
      const once = await rowsOf(trx, eventId);

      expect(await offerRide(trx, eventId, token, offer)).toEqual(first);
      expect(await rowsOf(trx, eventId)).toEqual(once);
      expect(once.rides.filter((ride) => ride.id === offer.rideId)).toHaveLength(1);
      const aller = legOf(await readEventState(trx, eventId, token), "aller");
      expect(aller.device.map((person) => person.state)).toEqual([{ kind: "driver", rideId: offer.rideId }]);
    });
  });

  it("C4.10: an offer sent again by a driver of the device changes nothing", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea } = await aScene(trx);
      const offer = anOffer("aller", { kind: "device", personId: lea.id });
      const first = await offerRide(trx, eventId, lea.token, offer);
      const once = await rowsOf(trx, eventId);
      expect(await offerRide(trx, eventId, lea.token, offer)).toEqual(first);
      expect(await rowsOf(trx, eventId)).toEqual(once);
    });
  });

  it.each<[string, (scene: Awaited<ReturnType<typeof aScene>>) => unknown]>([
    ["another person's token", (scene) => scene.lea.token],
    ["a well-formed token nobody holds", () => newToken()],
    ["a malformed token", (scene) => scene.tom.token.slice(1)],
    ["no token", () => undefined],
  ])("refuses a driver of another device, with %s, and changes nothing", async (_, tokenOf) => {
    await withRollback(async (trx) => {
      const scene = await aScene(trx);
      const before = await rowsOf(trx, scene.eventId);
      const offer = anOffer("aller", { kind: "device", personId: scene.tom.id });
      const result = await offerRide(trx, scene.eventId, tokenOf(scene), offer);
      expect(result).toEqual({ ok: false, error: "forbidden" });
      expect(await rowsOf(trx, scene.eventId)).toEqual(before);
    });
  });

  it("refuses a new driver whose id another device holds, and changes nothing", async () => {
    await withRollback(async (trx) => {
      const { eventId, tom } = await aScene(trx);
      const before = await rowsOf(trx, eventId);
      const offer = anOffer("aller", { ...aNewDriver(), personId: tom.id });
      expect(await offerRide(trx, eventId, newToken(), offer)).toEqual({ ok: false, error: "idTaken" });
      expect(await rowsOf(trx, eventId)).toEqual(before);
    });
  });

  it.each<[string, (offer: RideOffer) => unknown]>([
    ["a ride id that is not a uuid", (offer) => ({ ...offer, rideId: "r1" })],
    ["a leg that is not one", (offer) => ({ ...offer, leg: "detour" })],
    ["a driver of no known kind", (offer) => ({ ...offer, driver: { kind: "admin", personId: randomUUID() } })],
    ["a driver id that is not a uuid", (offer) => ({ ...offer, driver: { kind: "device", personId: 7 } })],
    ["no driver", (offer) => ({ ...offer, driver: undefined })],
    ["an offer that is not an object", () => "car"],
    ["another leg of no known kind", (offer) => ({ ...offer, otherLeg: { kind: "fly" } })],
    ["another leg that is not an object", (offer) => ({ ...offer, otherLeg: "keep" })],
    ["a car on the other leg without a uuid", (offer) => ({ ...offer, otherLeg: { ...aDrive(), rideId: "r2" } })],
    ["a car on the other leg with this leg's id", (offer) => ({ ...offer, otherLeg: { ...aDrive(), rideId: offer.rideId } })],
    ["passengers that are not a list", (offer) => ({ ...offer, passengerIds: randomUUID() })],
    ["a passenger id that is not a uuid", (offer) => ({ ...offer, passengerIds: [randomUUID(), "p1"] })],
    ["a passenger ticked twice", (offer) => ({ ...offer, passengerIds: Array<string>(2).fill(randomUUID()) })],
    ["the driver as a passenger", (offer) => ({ ...offer, passengerIds: [(offer.driver as { personId: string }).personId] })],
    // AL6.4: a position that is not one, or without its place.
    ["a position without its place", (offer) => ({ ...offer, location: undefined, position: VAUGNERAY })],
    ["a null position without its place", (offer) => ({ ...offer, location: undefined, position: null })],
    ["a position that is not an object", (offer) => ({ ...offer, position: "45.7,4.6" })],
    ["a position without a longitude", (offer) => ({ ...offer, position: { lat: 45.7 } })],
    ["a position with a latitude as text", (offer) => ({ ...offer, position: { lat: "45.7", lng: 4.6 } })],
    ["a position with an infinite longitude", (offer) => ({ ...offer, position: { lat: 45.7, lng: Infinity } })],
    ["a latitude above 90", (offer) => ({ ...offer, position: { lat: 90.1, lng: 4.6 } })],
    ["a latitude below -90", (offer) => ({ ...offer, position: { lat: -90.1, lng: 4.6 } })],
    ["a longitude above 180", (offer) => ({ ...offer, position: { lat: 45.7, lng: 180.1 } })],
    ["a longitude below -180", (offer) => ({ ...offer, position: { lat: 45.7, lng: -180.1 } })],
    ["a position on the other leg without its place", (offer) => ({ ...offer, otherLeg: aDrive({ location: undefined, position: VAUGNERAY }) })],
    ["a position on the other leg out of bounds", (offer) => ({ ...offer, otherLeg: aDrive({ position: { lat: 91, lng: 0 } }) })],
  ])("refuses %s as invalid, as eventNotFound on an unknown event, and changes nothing", async (_, forge) => {
    await withRollback(async (trx) => {
      const { eventId, lea } = await aScene(trx);
      const before = await rowsOf(trx, eventId);
      const offer = forge(anOffer("aller", { kind: "device", personId: lea.id }));
      expect(await offerRide(trx, eventId, lea.token, offer)).toEqual({ ok: false, error: "invalid" });
      expect(await offerRide(trx, "Zz9yXw8v", lea.token, offer)).toEqual({ ok: false, error: "eventNotFound" });
      expect(await rowsOf(trx, eventId)).toEqual(before);
    });
  });

  it("refuses a malformed event id as eventNotFound before reading anything, the offer forged or not", async () => {
    const untouchable = new Proxy({} as Db, {
      get(_target, property) {
        throw new Error(`the database was used (${String(property)})`);
      },
    });
    const offer = anOffer("aller", { kind: "device", personId: randomUUID() });
    // Field errors included: a malformed id is refused before them.
    const withFieldErrors = { ...offer, location: "", seats: "9", otherLeg: { kind: "drive", rideId: randomUUID() } };
    for (const sent of [offer, withFieldErrors, { ...offer, rideId: "r1" }, "car"]) {
      expect(await offerRide(untouchable, "Ab3dEf70", newToken(), sent)).toEqual({ ok: false, error: "eventNotFound" });
    }
  });

  it("refuses a new driver without a well-formed token as invalid, and changes nothing", async () => {
    await withRollback(async (trx) => {
      const { eventId } = await aScene(trx);
      const before = await rowsOf(trx, eventId);
      const offer = anOffer("aller", aNewDriver());
      expect(await offerRide(trx, eventId, "short", offer)).toEqual({ ok: false, error: "invalid" });
      expect(await offerRide(trx, "Zz9yXw8v", "short", offer)).toEqual({ ok: false, error: "eventNotFound" });
      expect(await rowsOf(trx, eventId)).toEqual(before);
    });
  });

  it("C4.7: refuses invalid fields with one error per field, the driver's first, and creates nothing", async () => {
    await withRollback(async (trx) => {
      const { eventId } = await aScene(trx);
      const before = await rowsOf(trx, eventId);
      const offer = anOffer("aller", { ...aNewDriver(" "), phone: "06" }, { location: "", time: "25:00", seats: "9" });
      expect(await offerRide(trx, eventId, newToken(), offer)).toEqual({
        ok: false,
        errors: { firstName: "required", phone: "invalid", location: "required", time: "invalid", seats: "outOfRange" },
        first: "firstName",
      });
      expect(await rowsOf(trx, eventId)).toEqual(before);
    });
  });

  it("M7.5: refuses a car on the retour of an event without one by noRetour, before forbidden, and an unknown event", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx, { retourAt: null });
      const { id, token } = await seedPerson(trx, eventId);
      const offer = anOffer("retour", { kind: "device", personId: id });
      expect(await offerRide(trx, eventId, token, offer)).toEqual({ ok: false, error: "noRetour" });
      expect(await offerRide(trx, eventId, newToken(), offer)).toEqual({ ok: false, error: "noRetour" });
      expect(await offerRide(trx, eventId, newToken(), anOffer("retour", aNewDriver()))).toEqual({ ok: false, error: "noRetour" });
      expect(await readTokenHolders(trx, eventId)).toHaveLength(1);
      expect(await offerRide(trx, "Zz9yXw8v", token, offer)).toEqual({ ok: false, error: "eventNotFound" });
      expect((await rowsOf(trx, eventId)).rides).toEqual([]);
    });
  });

  describe("the other leg", () => {
    const choices: Choice[] = ["drive", "withoutCar", "notConcerned", "keep"];
    const starts: Start[] = ["new", "notConcerned", "withoutCar", "passenger"];

    it.each(choices.flatMap((choice) => starts.map((start) => [choice, start] as const)))(
      "C4.11, C4.12: %s on the retour, from %s there",
      async (choice, start) => {
        await withRollback(async (trx) => {
          const { id: eventId } = await seedEvent(trx);
          const { r2, marc, token, driver, driverId } = await aRetourScene(trx, eventId, start);
          const drive = aDrive();
          const otherLeg = choice === "drive" ? drive : { kind: choice };
          const offer = anOffer("aller", driver, { otherLeg });

          expect(await offerRide(trx, eventId, token, offer)).toEqual({ ok: true, rideId: offer.rideId, driverId });

          const state = await readEventState(trx, eventId, token);
          expect(legOf(state, "aller").device).toEqual([
            expect.objectContaining({ id: driverId, state: { kind: "driver", rideId: offer.rideId } }),
          ]);
          const retour = legOf(state, "retour");
          const expected = retourAfter(choice, start, r2, drive.rideId);
          expect(retour.device).toEqual([expect.objectContaining({ id: driverId, state: expect.objectContaining(expected) })]);
          // The retour's cars: Marc's, which she leaves unless she keeps her seat (C4.12), and hers if she drives.
          const stays = expected.kind === "passenger";
          expect(retour.cars.map((car) => [car.id, car.driver.id, car.passengers.map((person) => person.id), car.freeSeats])).toEqual(
            [[r2, marc.id, stays ? [driverId] : [], stays ? 2 : 3], ...(choice === "drive" ? [[drive.rideId, driverId, [], 3]] : [])],
          );
          // C12.8 on both legs: no Placement where she drives.
          expect(await findPlacement(trx, { personId: driverId, eventId, leg: "aller" })).toBeUndefined();
          if (choice === "drive") {
            expect(await findPlacement(trx, { personId: driverId, eventId, leg: "retour" })).toBeUndefined();
          }
        });
      },
    );

    it("C4.2: a car on the retour too, by the same driver, with the same seats and note, at the place and time sent", async () => {
      await withRollback(async (trx) => {
        const { eventId, tom } = await aScene(trx);
        const drive = aDrive();
        const offer = anOffer("aller", { kind: "device", personId: tom.id }, { seats: "5", note: "Coffre plein", otherLeg: drive });

        expect(await offerRide(trx, eventId, tom.token, offer)).toMatchObject({ ok: true });

        const fields = ["id", "leg", "driver_id", "location", "departure_time", "seats", "note"] as const;
        const rides = await trx.selectFrom("ride").select(fields).where("driver_id", "=", tom.id).orderBy("leg").execute();
        expect(rides).toEqual([
          { ...{ id: offer.rideId, leg: "aller", driver_id: tom.id }, location: "Gare de Cesson", departure_time: "08:00:00", seats: 5, note: "Coffre plein" },
          { ...{ id: drive.rideId, leg: "retour", driver_id: tom.id }, location: "Salle Paul Bert", departure_time: "18:30:00", seats: 5, note: "Coffre plein" },
        ]);
      });
    });

    it("C4.10: the same offer sent again with a car on the retour creates no third car and no second Placement", async () => {
      await withRollback(async (trx) => {
        const { eventId, lea } = await aScene(trx);
        const offer = anOffer("aller", { kind: "device", personId: lea.id }, { otherLeg: aDrive() });
        const first = await offerRide(trx, eventId, lea.token, offer);
        const once = await rowsOf(trx, eventId);

        expect(await offerRide(trx, eventId, lea.token, offer)).toEqual(first);
        expect(await rowsOf(trx, eventId)).toEqual(once);
        expect(once.rides.filter((ride) => ride.driver_id === lea.id)).toHaveLength(2);
        const state = await readEventState(trx, eventId, lea.token);
        expect(legOf(state, "retour").device.map((person) => person.state.kind)).toEqual(["driver"]);
      });
    });

    it.each(["withoutCar", "notConcerned", "drive"] as const)(
      "C4.6: driving on the aller already, %s there is refused, and nothing changes",
      async (choice) => {
        await withRollback(async (trx) => {
          const { eventId, marc } = await aScene(trx);
          const before = await rowsOf(trx, eventId);
          const otherLeg = choice === "drive" ? aDrive() : { kind: choice };
          const offer = anOffer("retour", { kind: "device", personId: marc.id }, { otherLeg });
          expect(await offerRide(trx, eventId, marc.token, offer)).toEqual({ ok: false, error: "alreadyDriving" });
          expect(await rowsOf(trx, eventId)).toEqual(before);
        });
      },
    );

    it("C4.7: the retour's place and time get their own errors, after the note, and nothing is created", async () => {
      await withRollback(async (trx) => {
        const { eventId, tom } = await aScene(trx);
        const before = await rowsOf(trx, eventId);
        const driver = { kind: "device" as const, personId: tom.id };
        const otherLeg = aDrive({ location: " ", time: "7h" });
        expect(await offerRide(trx, eventId, tom.token, anOffer("aller", driver, { otherLeg }))).toEqual({
          ok: false,
          errors: { otherLocation: "required", otherTime: "invalid" },
          first: "otherLocation",
        });
        const withNote = anOffer("aller", driver, { note: "n".repeat(201), otherLeg: aDrive({ time: "" }) });
        expect(await offerRide(trx, eventId, tom.token, withNote)).toEqual({
          ok: false,
          errors: { note: "tooLong", otherTime: "required" },
          first: "note",
        });
        expect(await rowsOf(trx, eventId)).toEqual(before);
      });
    });

    it.each(["withoutCar", "drive"] as const)(
      "M7.6: refuses %s on the other leg of an event without a retour by noRetour, and accepts keep",
      async (choice) => {
        await withRollback(async (trx) => {
          const { id: eventId } = await seedEvent(trx, { retourAt: null });
          const { id, token } = await seedPerson(trx, eventId, { phone: DEVICE_PHONE });
          const driver = { kind: "device" as const, personId: id };
          const otherLeg = choice === "drive" ? aDrive() : { kind: choice };
          expect(await offerRide(trx, eventId, token, anOffer("aller", driver, { otherLeg }))).toEqual({ ok: false, error: "noRetour" });
          expect((await rowsOf(trx, eventId)).rides).toEqual([]);
          const kept = anOffer("aller", driver, { otherLeg: { kind: "keep" } });
          expect(await offerRide(trx, eventId, token, kept)).toMatchObject({ ok: true });
        });
      },
    );

    it("« Je ne fais pas le retour » on an event without a retour offers the car on the aller alone", async () => {
      await withRollback(async (trx) => {
        const { id: eventId } = await seedEvent(trx, { retourAt: null });
        const { id, token } = await seedPerson(trx, eventId, { phone: DEVICE_PHONE });
        await seedPlacement(trx, { personId: id, eventId, leg: "aller", rideId: null });
        const offer = anOffer("aller", { kind: "device", personId: id }, { otherLeg: { kind: "notConcerned" } });

        expect(await offerRide(trx, eventId, token, offer)).toEqual({ ok: true, rideId: offer.rideId, driverId: id });

        const rows = await rowsOf(trx, eventId);
        expect(rows.rides).toEqual([{ id: offer.rideId, leg: "aller", driver_id: id }]);
        expect(rows.placements).toEqual([]);
      });
    });
  });

  describe("the position (AL4.3)", () => {
    it("AL4.3: the car, and the other leg's, have the position sent, rounded to 5 decimals", async () => {
      await withRollback(async (trx) => {
        const { eventId, tom } = await aScene(trx);
        const drive = aDrive({ position: { lat: 45.7581449, lng: 4.6893851 } });
        const offer = anOffer("aller", { kind: "device", personId: tom.id }, { position: VAUGNERAY_EXACT, otherLeg: drive });

        expect(await offerRide(trx, eventId, tom.token, offer)).toMatchObject({ ok: true });

        expect(await positionOf(trx, offer.rideId)).toEqual({ location_lat: 45.73711, location_lng: 4.65622 });
        expect(await positionOf(trx, drive.rideId)).toEqual({ location_lat: 45.75814, location_lng: 4.68939 });
      });
    });

    it("AL4.3: without a position, or with a null one, the cars have none", async () => {
      await withRollback(async (trx) => {
        const { eventId, tom, lea } = await aScene(trx);
        const drive = aDrive();
        const typed = anOffer("aller", { kind: "device", personId: tom.id }, { otherLeg: drive });
        const nulls = anOffer("retour", { kind: "device", personId: lea.id }, { position: null });

        expect(await offerRide(trx, eventId, tom.token, typed)).toMatchObject({ ok: true });
        expect(await offerRide(trx, eventId, lea.token, nulls)).toMatchObject({ ok: true });

        for (const rideId of [typed.rideId, drive.rideId, nulls.rideId]) {
          expect(await positionOf(trx, rideId)).toEqual({ location_lat: null, location_lng: null });
        }
      });
    });

    it("C4.10: the same offer with a position sent again succeeds, and writes nothing more", async () => {
      await withRollback(async (trx) => {
        const { eventId } = await aScene(trx);
        const token = newToken();
        const drive = aDrive({ position: VAUGNERAY });
        const offer = anOffer("aller", aNewDriver(), { position: VAUGNERAY, otherLeg: drive });
        const first = await offerRide(trx, eventId, token, offer);
        const once = await rowsOf(trx, eventId);

        expect(first).toMatchObject({ ok: true });
        expect(await offerRide(trx, eventId, token, offer)).toEqual(first);
        expect(await rowsOf(trx, eventId)).toEqual(once);
        for (const rideId of [offer.rideId, drive.rideId]) {
          expect(await positionOf(trx, rideId)).toEqual({ location_lat: 45.73711, location_lng: 4.65622 });
        }
      });
    });
  });

  describe("the passengers", () => {
    it("C4.13: those ticked are in the new car on this leg, one not concerned too, and the other leg does not change", async () => {
      await withRollback(async (trx) => {
        const { id: eventId } = await seedEvent(trx);
        const { token, bea, cleo, driver } = await aDeviceScene(trx, eventId);
        const retourOf = async () => (await rowsOf(trx, eventId)).placements.filter((row) => row.leg === "retour");
        const retour = await retourOf();
        const offer = anOffer("aller", driver, { passengerIds: [bea.id, cleo.id] });

        expect(await offerRide(trx, eventId, token, offer)).toEqual({ ok: true, rideId: offer.rideId, driverId: driver.personId });

        const car = legOf(await readEventState(trx, eventId, token), "aller").cars.find((found) => found.id === offer.rideId);
        expect(car?.passengers.map((person) => person.id).sort()).toEqual([bea.id, cleo.id].sort());
        expect(car?.freeSeats).toBe(1);
        expect(await retourOf()).toEqual(retour);
      });
    });

    it("C4.13: as many ticked as seats fill the car", async () => {
      await withRollback(async (trx) => {
        const { id: eventId } = await seedEvent(trx);
        const { token, bea, cleo, driver } = await aDeviceScene(trx, eventId);
        const offer = anOffer("aller", driver, { seats: "2", passengerIds: [bea.id, cleo.id] });
        expect(await offerRide(trx, eventId, token, offer)).toMatchObject({ ok: true });
        const car = legOf(await readEventState(trx, eventId, token), "aller").cars.find((found) => found.id === offer.rideId);
        expect(car).toMatchObject({ freeSeats: 0, full: true });
      });
    });

    // The server's own limit, whatever the browser sends: refused before anything is read.
    it("C4.13: more ticked than seats is a field error, the last of the form, and nothing is read", async () => {
      const untouchable = new Proxy({} as Db, {
        get(_target, property) {
          throw new Error(`the database was used (${String(property)})`);
        },
      });
      const driver = { kind: "device" as const, personId: randomUUID() };
      const passengerIds = [randomUUID(), randomUUID()];
      const offerTo = (fields: Partial<RideOffer>, who: RideOffer["driver"] = driver) =>
        offerRide(untouchable, "Ab3dEf7h", newToken(), anOffer("aller", who, { seats: "1", passengerIds, ...fields }));

      expect(await offerTo({})).toEqual({ ok: false, errors: { passengers: "tooMany" }, first: "passengers" });
      const newcomer = { ...aNewDriver(), phone: "06" };
      expect(await offerTo({ note: "n".repeat(201), otherLeg: aDrive({ time: "" }) }, newcomer)).toEqual({
        ok: false,
        errors: { phone: "invalid", note: "tooLong", otherTime: "required", passengers: "tooMany" },
        first: "phone",
      });
      // The other leg's fields come before the passengers in the form.
      expect(await offerTo({ otherLeg: aDrive({ time: "" }) })).toEqual({
        ok: false,
        errors: { otherTime: "required", passengers: "tooMany" },
        first: "otherTime",
      });
      // Without a number of seats, there is nothing to count the passengers against.
      expect(await offerTo({ seats: "0" })).toEqual({ ok: false, errors: { seats: "outOfRange" }, first: "seats" });
    });

    it.each([
      ["in another car on this leg", "dan"],
      ["driving on this leg", "eve"],
    ] as const)("C4.13: a passenger %s is refused as alreadyInCar, and nothing changes", async (_, who) => {
      await withRollback(async (trx) => {
        const { id: eventId } = await seedEvent(trx);
        const scene = await aDeviceScene(trx, eventId);
        const before = await rowsOf(trx, eventId);
        const offer = anOffer("aller", scene.driver, { passengerIds: [scene.bea.id, scene[who].id] });
        expect(await offerRide(trx, eventId, scene.token, offer)).toEqual({ ok: false, error: "alreadyInCar" });
        expect(await rowsOf(trx, eventId)).toEqual(before);
      });
    });

    type Scene = Awaited<ReturnType<typeof aDeviceScene>>;
    it.each<[string, "forbidden" | "personGone", (trx: Db, scene: Scene) => string | Promise<string>]>([
      ["of another device", "forbidden", (_trx, scene) => scene.tom.id],
      // RP5.4: a person of no other device of the event is gone from it, removed since.
      ["nobody is", "personGone", () => randomUUID()],
      // Not a person of this event, though her token is the same: refused before the
      // foreign key of her placement would fail.
      [
        "of another event, with the same token",
        "personGone",
        async (trx, scene) => (await seedPerson(trx, (await seedEvent(trx)).id, { firstName: "Bea" }, scene.token)).id,
      ],
    ])("C2.4: a passenger %s is refused as %s, and nothing changes", async (_, error, passengerOf) => {
      await withRollback(async (trx) => {
        const { id: eventId } = await seedEvent(trx);
        const scene = await aDeviceScene(trx, eventId);
        const stranger = await passengerOf(trx, scene);
        const before = await rowsOf(trx, eventId);
        const passengerIds = [scene.bea.id, stranger];
        const refused = error === "forbidden" ? { ok: false, error } : { ok: false, error, goneIds: [stranger] };
        const offer = anOffer("aller", scene.driver, { passengerIds });
        expect(await offerRide(trx, eventId, scene.token, offer)).toEqual(refused);
        // Refused before the newcomer is written: even a transaction passed in is left as it was.
        const asNewcomer = anOffer("aller", aNewDriver(), { passengerIds });
        expect(await offerRide(trx, eventId, scene.token, asNewcomer)).toEqual(refused);
        expect(await rowsOf(trx, eventId)).toEqual(before);
      });
    });

    it("RP5.4: a driver of the device removed since is refused by personGone, and nothing changes", async () => {
      await withRollback(async (trx) => {
        const { id: eventId } = await seedEvent(trx);
        const scene = await aDeviceScene(trx, eventId);
        await deleteSeededPerson(trx, eventId, scene.ana.id);
        const before = await rowsOf(trx, eventId);
        const offer = anOffer("aller", scene.driver, { passengerIds: [scene.bea.id] });
        expect(await offerRide(trx, eventId, scene.token, offer)).toEqual({ ok: false, error: "personGone", goneIds: [scene.ana.id] });
        expect(await rowsOf(trx, eventId)).toEqual(before);
      });
    });

    it("a passenger of another device is refused as forbidden, before a driver gone", async () => {
      await withRollback(async (trx) => {
        const { id: eventId } = await seedEvent(trx);
        const scene = await aDeviceScene(trx, eventId);
        await deleteSeededPerson(trx, eventId, scene.ana.id);
        const offer = anOffer("aller", scene.driver, { passengerIds: [scene.tom.id] });
        expect(await offerRide(trx, eventId, scene.token, offer)).toEqual({ ok: false, error: "forbidden" });
      });
    });

    // Read before her removal committed, she is gone once her Person is locked: no Placement to
    // a person who is no longer there, so no foreign key's failure, and no car either.
    it.each(["driver", "passenger"] as const)("RP5.4: an offer that waited for the removal of its %s is refused by personGone", async (who) => {
      await withCommittedEvent(async (db, eventId) => {
        const scene = await aDeviceScene(db, eventId);
        const gone = who === "driver" ? scene.ana : scene.bea;
        const before = await rowsOf(db, eventId);
        const offer = anOffer("aller", scene.driver, { passengerIds: [scene.bea.id] });
        const result = await whileHeld(
          db,
          (trx) => deleteSeededPerson(trx, eventId, gone.id),
          (own) => offerRide(own, eventId, scene.token, offer),
        );
        expect(result).toEqual({ ok: false, error: "personGone", goneIds: [gone.id] });
        expect((await rowsOf(db, eventId)).rides).toEqual(before.rides);
      });
    });

    it("C4.10: sent again, the offer places each passenger once, and not again one who left", async () => {
      await withRollback(async (trx) => {
        const { id: eventId } = await seedEvent(trx);
        const { token, bea, cleo, driver } = await aDeviceScene(trx, eventId);
        const offer = anOffer("aller", driver, { passengerIds: [bea.id, cleo.id], otherLeg: aDrive() });
        const first = await offerRide(trx, eventId, token, offer);
        const once = await rowsOf(trx, eventId);
        expect(once.placements.filter((row) => row.ride_id === offer.rideId).map((row) => row.person_id).sort()).toEqual(
          [bea.id, cleo.id].sort(),
        );

        expect(await offerRide(trx, eventId, token, offer)).toEqual(first);
        expect(await rowsOf(trx, eventId)).toEqual(once);

        await setPlacement(trx, { personId: bea.id, eventId, leg: "aller", rideId: null });
        const left = await rowsOf(trx, eventId);
        expect(await offerRide(trx, eventId, token, offer)).toEqual(first);
        expect(await rowsOf(trx, eventId)).toEqual(left);
        expect(await findPlacement(trx, { personId: bea.id, eventId, leg: "aller" })).toEqual({ rideId: null });
      });
    });
  });

  describe("the number of who drives (v4.8, T4.7)", () => {
    it.each([
      ["absent", undefined],
      ["empty", ""],
      ["blank", "   "],
    ])("T4.7: a new driver with her number %s gets a field error, and nothing is written, on an unknown event too", async (_, phone) => {
      await withRollback(async (trx) => {
        const { eventId } = await aScene(trx);
        const before = await rowsOf(trx, eventId);
        const offer = anOffer("aller", { ...aNewDriver(), phone });
        const required = { ok: false, errors: { phone: "required" }, first: "phone" };
        expect(await offerRide(trx, eventId, newToken(), offer)).toEqual(required);
        expect(await offerRide(trx, "Zz9yXw8v", newToken(), offer)).toEqual(required);
        expect(await rowsOf(trx, eventId)).toEqual(before);
      });
    });

    it("T4.7: the number required is in the order of the form, after the first name and before the car", async () => {
      await withRollback(async (trx) => {
        const { eventId } = await aScene(trx);
        const before = await rowsOf(trx, eventId);
        const noName = anOffer("aller", { ...aNewDriver(""), phone: "" }, { location: "" });
        expect(await offerRide(trx, eventId, newToken(), noName)).toEqual({
          ok: false,
          errors: { firstName: "required", phone: "required", location: "required" },
          first: "firstName",
        });
        const named = anOffer("aller", { ...aNewDriver(), phone: "" }, { location: "" });
        expect(await offerRide(trx, eventId, newToken(), named)).toEqual({
          ok: false,
          errors: { phone: "required", location: "required" },
          first: "phone",
        });
        expect(await rowsOf(trx, eventId)).toEqual(before);
      });
    });

    it.each([
      ["absent", undefined],
      ["empty", ""],
      ["blank", "   "],
    ])("T4.7: a driver of the device without a number, the one sent %s, is refused by driverWithoutPhone, and nothing is written", async (_, phone) => {
      await withRollback(async (trx) => {
        const { id: eventId } = await seedEvent(trx);
        const claire = await aClaire(trx, eventId);
        const before = await rowsOf(trx, eventId);
        const offer = anOffer("aller", { ...claire.driver, phone }, { otherLeg: aDrive() });
        expect(await offerRide(trx, eventId, claire.token, offer)).toEqual({ ok: false, error: "driverWithoutPhone" });
        expect(await rowsOf(trx, eventId)).toEqual(before);
        expect(await phoneOf(trx, claire.id)).toBeNull();
      });
    });

    it.each([
      ["absent", undefined],
      ["empty", ""],
    ])("T4.7: a driver of the device with a number, the one sent %s, is accepted, her number unchanged", async (_, phone) => {
      await withRollback(async (trx) => {
        const { id: eventId } = await seedEvent(trx);
        const claire = await aClaire(trx, eventId, CLAIRE_PHONE);
        const offer = anOffer("aller", { ...claire.driver, phone });
        expect(await offerRide(trx, eventId, claire.token, offer)).toEqual({ ok: true, rideId: offer.rideId, driverId: claire.id });
        expect(await phoneOf(trx, claire.id)).toBe(CLAIRE_PHONE);
      });
    });

    it.each([
      ["without a number", null],
      ["with another number", CLAIRE_PHONE],
    ])("T4.7: a driver of the device %s who sends one gets it on her Person, read as R1 reads it, with both cars", async (_, stored) => {
      await withRollback(async (trx) => {
        const { id: eventId } = await seedEvent(trx);
        const claire = await aClaire(trx, eventId, stored);
        const drive = aDrive();
        const offer = anOffer("aller", { ...claire.driver, phone: ` \u202a${SENT_PHONE}\u202c ` }, { otherLeg: drive });
        expect(await offerRide(trx, eventId, claire.token, offer)).toEqual({ ok: true, rideId: offer.rideId, driverId: claire.id });
        expect(await phoneOf(trx, claire.id)).toBe(SENT_PHONE);
        const rides = (await rowsOf(trx, eventId)).rides.map((ride) => [ride.id, ride.driver_id]);
        expect(rides.sort()).toEqual([[offer.rideId, claire.id], [drive.rideId, claire.id]].sort());
      });
    });

    it("T4.7: a number sent for a driver of the device follows R1: malformed, it is a field error, the driver's first", async () => {
      await withRollback(async (trx) => {
        const { id: eventId } = await seedEvent(trx);
        const claire = await aClaire(trx, eventId);
        const before = await rowsOf(trx, eventId);
        const offer = anOffer("aller", { ...claire.driver, phone: "06 12" }, { time: "25:00" });
        expect(await offerRide(trx, eventId, claire.token, offer)).toEqual({
          ok: false,
          errors: { phone: "invalid", time: "invalid" },
          first: "phone",
        });
        const forged = anOffer("aller", { ...claire.driver, phone: 612345678 });
        expect(await offerRide(trx, eventId, claire.token, forged)).toEqual({ ok: false, errors: { phone: "invalid" }, first: "phone" });
        expect(await rowsOf(trx, eventId)).toEqual(before);
        expect(await phoneOf(trx, claire.id)).toBeNull();
      });
    });

    it("T4.7: an offer refused by alreadyDriving or alreadyInCar leaves the number as it was", async () => {
      await withRollback(async (trx) => {
        const { id: eventId } = await seedEvent(trx);
        const { token, ana, dan, eve, driver } = await aDeviceScene(trx, eventId);
        const before = await rowsOf(trx, eventId);

        const byEve = anOffer("aller", { kind: "device", personId: eve.id, phone: SENT_PHONE });
        expect(await offerRide(trx, eventId, token, byEve)).toEqual({ ok: false, error: "alreadyDriving" });
        const withDan = anOffer("aller", { ...driver, phone: SENT_PHONE }, { passengerIds: [dan.id] });
        expect(await offerRide(trx, eventId, token, withDan)).toEqual({ ok: false, error: "alreadyInCar" });
        expect(await rowsOf(trx, eventId)).toEqual(before);
        expect(await phoneOf(trx, eve.id)).toBe(DEVICE_PHONE);
        expect(await phoneOf(trx, ana.id)).toBe(DEVICE_PHONE);
      });
    });

    it("T4.7: an offer refused by noRetour leaves the number as it was", async () => {
      await withRollback(async (trx) => {
        const { id: eventId } = await seedEvent(trx, { retourAt: null });
        const claire = await seedPerson(trx, eventId, { firstName: "Claire" });
        const offer = anOffer("retour", { kind: "device", personId: claire.id, phone: SENT_PHONE });
        expect(await offerRide(trx, eventId, claire.token, offer)).toEqual({ ok: false, error: "noRetour" });
        expect(await phoneOf(trx, claire.id)).toBeNull();
      });
    });

    it("T4.7, C4.10: sent again after a lost answer, the offer writes the number no more", async () => {
      await withRollback(async (trx) => {
        const { id: eventId } = await seedEvent(trx);
        const claire = await aClaire(trx, eventId);
        const offer = anOffer("aller", { ...claire.driver, phone: SENT_PHONE });
        const first = await offerRide(trx, eventId, claire.token, offer);
        expect(first).toMatchObject({ ok: true });
        // Changed since, from « Modifier Claire »: the offer sent again does not undo it.
        await trx.updateTable("person").set({ phone: CLAIRE_PHONE }).where("id", "=", claire.id).execute();
        const once = await rowsOf(trx, eventId);
        expect(await offerRide(trx, eventId, claire.token, offer)).toEqual(first);
        expect(await rowsOf(trx, eventId)).toEqual(once);
        expect(await phoneOf(trx, claire.id)).toBe(CLAIRE_PHONE);
      });
    });
  });

  describe("on committed data", () => {
    /** A plugin whose inserts into `table` fail from the `nth` on, as if the database broke at that moment. */
    function failingInsert(nth = 1, table = "ride"): KyselyPlugin {
      let inserts = 0;
      return {
        transformQuery({ node }) {
          const into = node.kind === "InsertQueryNode" ? node.into : undefined;
          if (into && TableNode.is(into) && into.table.identifier.name === table && ++inserts >= nth) {
            throw new Error("injected failure");
          }
          return node;
        },
        async transformResult({ result }) {
          return result;
        },
      };
    }

    it("C4.5: one write: a failure at the insert of the Ride leaves the seat and the person as they were", async () => {
      await withCommittedEvent(async (db, eventId) => {
        const { lea } = await seedScene(db, eventId);
        const before = await rowsOf(db, eventId);
        const failing = db.withPlugin(failingInsert());

        const asPassenger = anOffer("aller", { kind: "device", personId: lea.id });
        await expect(offerRide(failing, eventId, lea.token, asPassenger)).rejects.toThrow("injected failure");
        const asNewcomer = anOffer("aller", aNewDriver());
        await expect(offerRide(failing, eventId, newToken(), asNewcomer)).rejects.toThrow("injected failure");
        expect(await rowsOf(db, eventId)).toEqual(before);
      });
    });

    // The car on the retour is inserted first, then the aller's: the second insert fails
    // after every other write, the first before the aller's.
    it.each([
      ["the retour's car", 1],
      ["the aller's car, the last write", 2],
    ])("C4.5: all or nothing: a failure at the insert of %s changes neither leg", async (_, nth) => {
      await withCommittedEvent(async (db, eventId) => {
        const { lea } = await seedScene(db, eventId);
        const before = await rowsOf(db, eventId);
        const offer = anOffer("aller", { kind: "device", personId: lea.id }, { otherLeg: aDrive() });
        const failing = db.withPlugin(failingInsert(nth));
        await expect(offerRide(failing, eventId, lea.token, offer)).rejects.toThrow("injected failure");
        expect(await rowsOf(db, eventId)).toEqual(before);
      });
    });

    // The passengers are placed last, after both cars: the second one fails after every other write.
    it("C4.5: one write: a failure at the placement of the second passenger leaves no car, no person, no placement", async () => {
      await withCommittedEvent(async (db, eventId) => {
        const { token, bea, cleo } = await aDeviceScene(db, eventId);
        const before = await rowsOf(db, eventId);
        const offer = anOffer("aller", aNewDriver(), { passengerIds: [bea.id, cleo.id], otherLeg: aDrive() });
        await expect(offerRide(db.withPlugin(failingInsert(2, "placement")), eventId, token, offer)).rejects.toThrow(
          "injected failure",
        );
        expect(await rowsOf(db, eventId)).toEqual(before);
      });
    });

    // Under READ COMMITTED: Bea takes a seat in Marc's car while the offer waits for her
    // Person. Once it gets her, it sees that seat, and refuses before writing anything.
    it("C4.13: a passenger who takes a seat elsewhere while the offer waits for her is refused, with that seat in the state", async () => {
      await withCommittedEvent(async (db, eventId) => {
        const { token, bea, r1, driver } = await aDeviceScene(db, eventId);
        const before = await rowsOf(db, eventId);

        const taker = await db.startTransaction().setIsolationLevel("read committed").execute();
        let offered: ReturnType<typeof offerRideAction> | undefined;
        const offer = anOffer("aller", driver, { passengerIds: [bea.id] });
        try {
          await setPlacement(taker, { personId: bea.id, eventId, leg: "aller", rideId: r1 });
          const { rows } = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(taker);
          offered = offerRideAction(eventId, token, offer);
          offered.catch(() => {});
          await blockedBy(db, rows[0].pid);
          await taker.commit().execute();
        } finally {
          try {
            await taker.rollback().execute();
          } catch {
            // Committed.
          }
        }

        const result = await offered;
        expect(result).toMatchObject({ ok: false, error: "alreadyInCar" });
        const aller = legOf(result && "state" in result ? result.state : undefined, "aller");
        expect(aller.cars.find((car) => car.id === r1)?.passengers.map((person) => person.id)).toContain(bea.id);
        const after = await rowsOf(db, eventId);
        expect(after.rides).toEqual(before.rides);
        expect(after.persons).toEqual(before.persons);
        expect(await findPlacement(db, { personId: driver.personId, eventId, leg: "aller" })).toEqual({ rideId: null });
      });
    });

    // Léa leaves A on the aller and B on the retour. A transaction that holds B alone keeps
    // the offer waiting, before it locks any Person (lock order: Rides, then Persons).
    it.each(["withoutCar", "notConcerned", "drive"] as const)(
      "locks: with %s on the retour, the offer waits for the car it leaves there, before any Person",
      async (choice) => {
        await withCommittedEvent(async (db, eventId) => {
          const marc = await seedPerson(db, eventId, { firstName: "Marc" });
          const ines = await seedPerson(db, eventId, { firstName: "Inès" });
          const a = await seedRide(db, eventId, marc.id, { leg: "aller" });
          const b = await seedRide(db, eventId, ines.id, { leg: "retour" });
          const lea = await seedPerson(db, eventId, { firstName: "Léa", phone: DEVICE_PHONE });
          const tom = await seedPerson(db, eventId, { firstName: "Tom" }, lea.token);
          await seedPlacement(db, { personId: lea.id, eventId, leg: "aller", rideId: a });
          await seedPlacement(db, { personId: lea.id, eventId, leg: "retour", rideId: b });
          await seedPlacement(db, { personId: tom.id, eventId, leg: "aller", rideId: null });

          const holder = await db.startTransaction().setIsolationLevel("read committed").execute();
          let offered: ReturnType<typeof offerRide> | undefined;
          let personsFree: boolean | undefined;
          try {
            await sql`select id from ride where id = ${b} for update`.execute(holder);
            const { rows } = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(holder);
            const otherLeg = choice === "drive" ? aDrive() : { kind: choice };
            const offer = anOffer("aller", { kind: "device", personId: lea.id }, { otherLeg, passengerIds: [tom.id] });
            offered = offerRide(db, eventId, lea.token, offer);
            offered.catch(() => {});
            await blockedBy(db, rows[0].pid);
            const persons = sql`select id from person where id in (${lea.id}, ${tom.id}) for update nowait`.execute(db);
            // Locked is false; any other failure is no answer, and fails the test.
            personsFree = await persons.then(
              () => true,
              (error: { code?: string }) => {
                if (error.code === "55P03") return false;
                throw error;
              },
            );
            await holder.commit().execute();
          } finally {
            try {
              await holder.rollback().execute();
            } catch {
              // Committed.
            }
          }

          expect(await offered).toMatchObject({ ok: true });
          expect(personsFree).toBe(true);
          const retour = legOf(await readEventState(db, eventId, lea.token), "retour");
          expect(retour.cars.find((car) => car.id === b)?.passengers).toEqual([]);
        });
      },
    );

    // The number is written before the Placements and the Rides: a failure after it undoes it.
    it("T4.7, C4.5: one write: the number sent goes with the cars, a failure at the insert of a Ride undoes it", async () => {
      await withCommittedEvent(async (db, eventId) => {
        const claire = await aClaire(db, eventId);
        const before = await rowsOf(db, eventId);
        const offer = anOffer("aller", { ...claire.driver, phone: SENT_PHONE }, { otherLeg: aDrive() });
        await expect(offerRide(db.withPlugin(failingInsert(2)), eventId, claire.token, offer)).rejects.toThrow("injected failure");
        expect(await rowsOf(db, eventId)).toEqual(before);
        expect(await phoneOf(db, claire.id)).toBeNull();
      });
    });

    it("T4.7: an offer refused by idTaken, after the number is written, leaves it as it was", async () => {
      await withCommittedEvent(async (db, eventId) => {
        const claire = await aClaire(db, eventId);
        const before = await rowsOf(db, eventId);
        await withCommittedEvent(async (other, otherId) => {
          const { id: driverId } = await seedPerson(other, otherId);
          const rideId = await seedRide(other, otherId, driverId);
          const offer = anOffer("aller", { ...claire.driver, phone: SENT_PHONE }, { rideId });
          expect(await offerRide(db, eventId, claire.token, offer)).toEqual({ ok: false, error: "idTaken" });
        });
        expect(await rowsOf(db, eventId)).toEqual(before);
        expect(await phoneOf(db, claire.id)).toBeNull();
      });
    });

    // Known only once the insert does nothing, after the seat is freed: the refusal rolls it back.
    it("a ride id held by another event is refused, and the driver keeps her seat", async () => {
      await withCommittedEvent(async (db, eventId) => {
        const { lea } = await seedScene(db, eventId);
        const before = await rowsOf(db, eventId);
        await withCommittedEvent(async (other, otherId) => {
          const { id: driverId } = await seedPerson(other, otherId);
          const rideId = await seedRide(other, otherId, driverId);
          const offer = anOffer("aller", { kind: "device", personId: lea.id }, { rideId });
          expect(await offerRide(db, eventId, lea.token, offer)).toEqual({ ok: false, error: "idTaken" });
        });
        expect(await rowsOf(db, eventId)).toEqual(before);
      });
    });

    // Under READ COMMITTED, the level of its write: Tom is placed in Marc's car while his
    // offer waits for his Person. Once it gets her, it sees the seat he took, locks that
    // Ride first (lock order: Ride, then Person) and frees it: no deadlock, no driver placed.
    it("C12.8: a seat taken by the driver while the offer waits is freed, the Ride locked first", async () => {
      await withCommittedEvent(async (db, eventId) => {
        const { tom, r1 } = await seedScene(db, eventId);

        // Once the offer deletes Tom's Placement, and before it commits: is r1 locked?
        const deletes = new Set<QueryId>();
        const lockedAtDelete: boolean[] = [];
        const watch: KyselyPlugin = {
          transformQuery({ node, queryId }) {
            if (node.kind === "DeleteQueryNode") deletes.add(queryId);
            return node;
          },
          async transformResult({ queryId, result }) {
            if (deletes.has(queryId)) {
              const lock = sql`select id from ride where id = ${r1} for update nowait`.execute(db);
              lockedAtDelete.push(await lock.then(() => false, (error: { code?: string }) => error.code === "55P03"));
            }
            return result;
          },
        };

        const taker = await db.startTransaction().setIsolationLevel("read committed").execute();
        let offered: ReturnType<typeof offerRide> | undefined;
        try {
          await setPlacement(taker, { personId: tom.id, eventId, leg: "aller", rideId: r1 });
          const { rows } = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(taker);
          const offer = anOffer("aller", { kind: "device", personId: tom.id });
          offered = offerRide(db.withPlugin(watch), eventId, tom.token, offer);
          offered.catch(() => {});
          await blockedBy(db, rows[0].pid);
          await taker.commit().execute();
        } finally {
          // Kysely throws on a transaction already committed: nothing is left to give back.
          try {
            await taker.rollback().execute();
          } catch {
            // Committed.
          }
        }

        expect(await offered).toMatchObject({ ok: true });
        expect(lockedAtDelete).toEqual([true]);
        const aller = legOf(await readEventState(db, eventId, tom.token), "aller");
        expect(aller.cars.find((car) => car.id === r1)?.passengers.map((person) => person.id)).not.toContain(tom.id);
        expect(await findPlacement(db, { personId: tom.id, eventId, leg: "aller" })).toBeUndefined();
      });
    });

    // Léa offers on the aller and Tom on the retour, each with a car on the other leg: each
    // leaves A (aller) and B (retour), in reverse roles. Locked by leg, Léa would hold A and
    // wait for B while Tom holds B and waits for A. Locked by id, both start with the same one.
    it("locks: two offers that leave the same two Rides in reverse roles both succeed, without a deadlock", async () => {
      await withCommittedEvent(async (db, eventId) => {
        const marc = await seedPerson(db, eventId, { firstName: "Marc" });
        const ines = await seedPerson(db, eventId, { firstName: "Inès" });
        const a = await seedRide(db, eventId, marc.id, { leg: "aller" });
        const b = await seedRide(db, eventId, ines.id, { leg: "retour" });
        const lea = await seedPerson(db, eventId, { firstName: "Léa", phone: DEVICE_PHONE });
        const tom = await seedPerson(db, eventId, { firstName: "Tom", phone: DEVICE_PHONE });
        for (const person of [lea, tom]) {
          await seedPlacement(db, { personId: person.id, eventId, leg: "aller", rideId: a });
          await seedPlacement(db, { personId: person.id, eventId, leg: "retour", rideId: b });
        }

        // Both Rides held, so that both offers wait at their first lock, then start together.
        const holder = await db.startTransaction().setIsolationLevel("read committed").execute();
        let offers: Promise<PromiseSettledResult<unknown>[]> | undefined;
        try {
          await sql`select id from ride where id in (${a}, ${b}) for update`.execute(holder);
          const { rows } = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(holder);
          const fromAller = anOffer("aller", { kind: "device", personId: lea.id }, { otherLeg: aDrive() });
          const fromRetour = anOffer("retour", { kind: "device", personId: tom.id }, { otherLeg: aDrive({ time: "08:00" }) });
          offers = Promise.allSettled([
            offerRide(db, eventId, lea.token, fromAller),
            offerRide(db, eventId, tom.token, fromRetour),
          ]);
          await blockedBy(db, rows[0].pid, 2);
          await holder.commit().execute();
        } finally {
          try {
            await holder.rollback().execute();
          } catch {
            // Committed.
          }
        }

        const ok = { status: "fulfilled", value: expect.objectContaining({ ok: true }) };
        expect(await offers).toEqual([ok, ok]);
        const state = await readEventState(db, eventId, lea.token);
        for (const leg of ["aller", "retour"] as const) {
          const { cars } = legOf(state, leg);
          expect(cars.flatMap((car) => car.passengers)).toEqual([]);
          expect(cars.map((car) => car.driver.id).sort()).toEqual([leg === "aller" ? marc.id : ines.id, lea.id, tom.id].sort());
        }
      });
    });
  });
});
