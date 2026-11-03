import { randomBytes, randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findEventById, lockEvent } from "@/db/events";
import { countLegRows } from "@/db/legs";
import { findPlacement } from "@/db/placements";
import { ridePassengers } from "@/db/rides";
import type { Database } from "@/db/schema";
import { closeSession } from "@/db/sessions";
import { seedAccount, seedSession, withCommittedAddresses } from "@/db/test-accounts";
import { whileHeld, withCommittedEvent } from "@/db/test-committed";
import { seedPerson, seedPlacement, seedRide, type SeededPerson } from "@/db/test-participants";
import type { EventHeader } from "@/domain/event";
import type { Leg } from "@/domain/leg";
import { PERSONAL_TOKEN_BYTES, personalTokenFromBytes } from "@/domain/personal-token";
import { updateRide } from "./change-ride";
import { editEvent } from "./edit-event";
import { offerRide } from "./offer-ride";
import { setPersonLeg } from "./persons";
import { removeAsOrganiser, removeFromDevice } from "./remove-person";
import { takeSeats } from "./seats";

/*
 * RP2.8 on committed data: a removal and another write at the same time, in both orders.
 * `whileHeld` holds the first one open until the second waits for one of its locks, then
 * commits it: the second always runs on what the first committed, never beside it. After
 * each case, the invariants: no Placement in a missing Ride, no Ride without its driver,
 * and no answer `failed`, the page's word for a write that threw (#87).
 */

type Db = Kysely<Database>;

function newToken(): string {
  return personalTokenFromBytes(randomBytes(PERSONAL_TOKEN_BYTES));
}

/**
 * | person  | aller                        | retour                    |
 * |---------|------------------------------|---------------------------|
 * | Marc    | drives (3 seats): Léa, Inès  | with Sophie               |
 * | Léa     | with Marc                    | without a car             |
 * | Inès    | with Marc                    | not concerned             |
 * | Claire  | drives (2 seats): nobody     | not concerned             |
 * | Sophie  | not concerned                | drives (3 seats): Marc    |
 * | Tom     | without a car                | not concerned             |
 *
 * Marc and Léa are the Martins' device; every other person has her own. Marc and Tom, who offer
 * cars, have a number (v4.8).
 */
async function seedScene(db: Db, eventId: string) {
  const martins = newToken();
  const marc = await seedPerson(db, eventId, { firstName: "Marc", phone: "06 11 11 11 11" }, martins);
  const lea = await seedPerson(db, eventId, { firstName: "Léa" }, martins);
  const ines = await seedPerson(db, eventId, { firstName: "Inès" });
  const claire = await seedPerson(db, eventId, { firstName: "Claire" });
  const sophie = await seedPerson(db, eventId, { firstName: "Sophie" });
  const tom = await seedPerson(db, eventId, { firstName: "Tom", phone: "06 33 33 33 33" });
  const rides = {
    marcAller: await seedRide(db, eventId, marc.id, { leg: "aller", seats: 3 }),
    claireAller: await seedRide(db, eventId, claire.id, { leg: "aller", seats: 2 }),
    sophieRetour: await seedRide(db, eventId, sophie.id, { leg: "retour", seats: 3, departureTime: "18:15:00" }),
  };
  const place = (person: SeededPerson, leg: Leg, rideId: string | null) =>
    seedPlacement(db, { personId: person.id, eventId, leg, rideId });
  await place(lea, "aller", rides.marcAller);
  await place(ines, "aller", rides.marcAller);
  await place(tom, "aller", null);
  await place(marc, "retour", rides.sophieRetour);
  await place(lea, "retour", null);
  return { martins, marc, lea, ines, claire, sophie, tom, rides };
}

type Scene = Awaited<ReturnType<typeof seedScene>>;

/** What a write gave, or `failed` with what it threw: the page would say « failed » (#87). */
async function answerOf<T>(write: () => Promise<T>): Promise<T | { failed: string }> {
  try {
    return await write();
  } catch (error) {
    return { failed: String(error) };
  }
}

/** `first`, held until `second`, on the connection it is given, waits for it, then committed; both answers, each one or `failed`. */
async function inOrder<A, B>(db: Db, first: (trx: Db) => Promise<A>, second: (own: Db) => Promise<B>) {
  let firstAnswer: A | { failed: string } | undefined;
  const secondAnswer = await whileHeld(
    db,
    async (trx) => {
      firstAnswer = await answerOf(() => first(trx));
    },
    (own) => answerOf(() => second(own)),
  );
  return { first: firstAnswer, second: secondAnswer };
}

/** The invariants of RP2.8, after every case. */
async function expectInvariants(db: Db, eventId: string, answers: readonly unknown[]) {
  for (const answer of answers) {
    expect(answer).not.toHaveProperty("failed");
    expect(answer).not.toMatchObject({ error: "failed" });
  }
  const orphans = await db
    .selectFrom("placement")
    .leftJoin("ride", (join) =>
      join
        .onRef("ride.id", "=", "placement.ride_id")
        .onRef("ride.event_id", "=", "placement.event_id")
        .onRef("ride.leg", "=", "placement.leg"),
    )
    .select(["placement.person_id", "placement.ride_id"])
    .where("placement.event_id", "=", eventId)
    .where("placement.ride_id", "is not", null)
    .where("ride.id", "is", null)
    .execute();
  expect(orphans, "a Placement in a missing Ride").toEqual([]);
  const driverless = await db
    .selectFrom("ride")
    .leftJoin("person", (join) => join.onRef("person.id", "=", "ride.driver_id").onRef("person.event_id", "=", "ride.event_id"))
    .select(["ride.id", "ride.driver_id"])
    .where("ride.event_id", "=", eventId)
    .where("person.id", "is", null)
    .execute();
  expect(driverless, "a Ride without its driver").toEqual([]);
}

/** No row of hers is left: her Person, her Rides, her Placements (RP2). */
async function expectGone(db: Db, eventId: string, personId: string) {
  const persons = await db.selectFrom("person").select("id").where("event_id", "=", eventId).where("id", "=", personId).execute();
  const rides = await db.selectFrom("ride").select("id").where("event_id", "=", eventId).where("driver_id", "=", personId).execute();
  const placements = await db
    .selectFrom("placement")
    .select("leg")
    .where("event_id", "=", eventId)
    .where("person_id", "=", personId)
    .execute();
  expect({ persons, rides, placements }).toEqual({ persons: [], rides: [], placements: [] });
}

async function passengersOf(db: Db, eventId: string, rideId: string, leg: Leg) {
  const passengers = await ridePassengers(db, { id: rideId, eventId, leg });
  return passengers.map((passenger) => passenger.personId).sort();
}

async function seatOf(db: Db, eventId: string, person: SeededPerson, leg: Leg) {
  return (await findPlacement(db, { personId: person.id, eventId, leg }))?.rideId;
}

const remove = (db: Db, eventId: string, person: SeededPerson, token = person.token) =>
  removeFromDevice(db, eventId, token, { personId: person.id });

describe("RP2.8 (1): a seat taken in her car while the driver is removed", () => {
  it("the seat first: the removal waits for her Ride, then takes the car, and Tom is without a car again", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const { marc, lea, ines, tom, rides } = await seedScene(db, eventId);
      const answers = await inOrder(
        db,
        (trx) => takeSeats(trx, eventId, tom.token, rides.marcAller, "aller", [tom.id]),
        (own) => remove(own, eventId, marc),
      );
      expect(answers.first).toMatchObject({ ok: true });
      expect(answers.second).toMatchObject({ ok: true, removal: "removed" });
      for (const passenger of [lea, ines, tom]) expect(await seatOf(db, eventId, passenger, "aller")).toBeNull();
      await expectGone(db, eventId, marc.id);
      await expectInvariants(db, eventId, [answers.first, answers.second]);
    });
  });

  it("the removal first: the seat waits for the Ride, finds it gone, and is rideGone", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const { marc, tom, rides } = await seedScene(db, eventId);
      const answers = await inOrder(
        db,
        (trx) => remove(trx, eventId, marc),
        (own) => takeSeats(own, eventId, tom.token, rides.marcAller, "aller", [tom.id]),
      );
      expect(answers.first).toMatchObject({ ok: true, removal: "removed" });
      expect(answers.second).toMatchObject({ ok: false, error: "rideGone" });
      expect(await seatOf(db, eventId, tom, "aller")).toBeNull();
      await expectGone(db, eventId, marc.id);
      await expectInvariants(db, eventId, [answers.first, answers.second]);
    });
  });
});

describe("RP2.8 (2): the removed person's own seat-taking, personGone and never failed", () => {
  it("the removal first: the seat waits for her Person, finds her gone, and is personGone", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const { tom, rides } = await seedScene(db, eventId);
      const answers = await inOrder(
        db,
        (trx) => remove(trx, eventId, tom),
        (own) => takeSeats(own, eventId, tom.token, rides.claireAller, "aller", [tom.id]),
      );
      expect(answers.first).toMatchObject({ ok: true, removal: "removed" });
      expect(answers.second).toMatchObject({ ok: false, error: "personGone", goneIds: [tom.id] });
      expect(await passengersOf(db, eventId, rides.claireAller, "aller")).toEqual([]);
      await expectGone(db, eventId, tom.id);
      await expectInvariants(db, eventId, [answers.first, answers.second]);
    });
  });

  it("the seat first: the removal waits for her Person, then takes her seat with her", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const { tom, rides } = await seedScene(db, eventId);
      const answers = await inOrder(
        db,
        (trx) => takeSeats(trx, eventId, tom.token, rides.claireAller, "aller", [tom.id]),
        (own) => remove(own, eventId, tom),
      );
      expect(answers.first).toMatchObject({ ok: true });
      expect(answers.second).toMatchObject({ ok: true, removal: "removed" });
      expect(await passengersOf(db, eventId, rides.claireAller, "aller")).toEqual([]);
      await expectGone(db, eventId, tom.id);
      await expectInvariants(db, eventId, [answers.first, answers.second]);
    });
  });
});

describe("RP2.8 (3): setPersonLeg while she is removed", () => {
  // Marc drives on the aller: the removal locks his Ride, then waits for his Person.
  it("the removal first: setPersonLeg waits for her Person, finds her gone, and is personGone", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const { martins, marc, rides } = await seedScene(db, eventId);
      const answers = await inOrder(
        db,
        (trx) => remove(trx, eventId, marc),
        (own) => setPersonLeg(own, eventId, martins, { personId: marc.id, leg: "retour", kind: "withoutCar" }),
      );
      expect(answers.first).toMatchObject({ ok: true, removal: "removed" });
      expect(answers.second).toMatchObject({ ok: false, error: "personGone" });
      expect(await passengersOf(db, eventId, rides.sophieRetour, "retour")).toEqual([]);
      await expectGone(db, eventId, marc.id);
      await expectInvariants(db, eventId, [answers.first, answers.second]);
    });
  });

  it("setPersonLeg first: the removal waits for her Person, then removes her and her new Placement", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const { martins, marc, lea, ines, rides } = await seedScene(db, eventId);
      const answers = await inOrder(
        db,
        (trx) => setPersonLeg(trx, eventId, martins, { personId: marc.id, leg: "retour", kind: "withoutCar" }),
        (own) => remove(own, eventId, marc),
      );
      expect(answers.first).toMatchObject({ ok: true });
      expect(answers.second).toMatchObject({ ok: true, removal: "removed" });
      expect(await passengersOf(db, eventId, rides.sophieRetour, "retour")).toEqual([]);
      for (const passenger of [lea, ines]) expect(await seatOf(db, eventId, passenger, "aller")).toBeNull();
      await expectGone(db, eventId, marc.id);
      await expectInvariants(db, eventId, [answers.first, answers.second]);
    });
  });
});

const offerBy = (driver: SeededPerson, leg: Leg, passengerIds: string[] = []) => ({
  rideId: randomUUID(),
  leg,
  driver: { kind: "device", personId: driver.id },
  location: "Salle Paul Bert",
  time: leg === "aller" ? "07:00" : "18:30",
  seats: "3",
  note: "",
  passengerIds,
});

describe("RP2.8 (4): a car offered while she is removed", () => {
  it("the removal first: the offer waits for her Person, finds her gone, and is personGone", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const { tom } = await seedScene(db, eventId);
      const answers = await inOrder(
        db,
        (trx) => remove(trx, eventId, tom),
        (own) => offerRide(own, eventId, tom.token, offerBy(tom, "aller")),
      );
      expect(answers.first).toMatchObject({ ok: true, removal: "removed" });
      expect(answers.second).toEqual({ ok: false, error: "personGone", goneIds: [tom.id] });
      await expectGone(db, eventId, tom.id);
      await expectInvariants(db, eventId, [answers.first, answers.second]);
    });
  });

  // Her car appears between the read of her Rides and the lock of her Person: one restart.
  it("the offer first: the removal waits for her Person, starts again once, and takes the new car", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const { tom } = await seedScene(db, eventId);
      const answers = await inOrder(
        db,
        (trx) => offerRide(trx, eventId, tom.token, offerBy(tom, "aller")),
        (own) => remove(own, eventId, tom),
      );
      expect(answers.first).toMatchObject({ ok: true, driverId: tom.id });
      expect(answers.second).toMatchObject({ ok: true, removal: "removed" });
      await expectGone(db, eventId, tom.id);
      await expectInvariants(db, eventId, [answers.first, answers.second]);
    });
  });

  it("the removal of a passenger ticked first: the offer waits for her Person, and is personGone with her alone", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const { martins, marc, lea, rides } = await seedScene(db, eventId);
      const answers = await inOrder(
        db,
        (trx) => remove(trx, eventId, lea),
        (own) => offerRide(own, eventId, martins, offerBy(marc, "retour", [lea.id])),
      );
      expect(answers.first).toMatchObject({ ok: true, removal: "removed" });
      expect(answers.second).toEqual({ ok: false, error: "personGone", goneIds: [lea.id] });
      // Nothing of the offer is written: Marc is still with Sophie.
      expect(await seatOf(db, eventId, marc, "retour")).toBe(rides.sophieRetour);
      await expectGone(db, eventId, lea.id);
      await expectInvariants(db, eventId, [answers.first, answers.second]);
    });
  });

  it("the offer that ticks her first: the removal waits for her Person, and takes her out of the new car", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const { martins, marc, lea } = await seedScene(db, eventId);
      const offer = offerBy(marc, "retour", [lea.id]);
      const answers = await inOrder(
        db,
        (trx) => offerRide(trx, eventId, martins, offer),
        (own) => remove(own, eventId, lea),
      );
      expect(answers.first).toMatchObject({ ok: true, rideId: offer.rideId });
      expect(answers.second).toMatchObject({ ok: true, removal: "removed" });
      expect(await passengersOf(db, eventId, offer.rideId, "retour")).toEqual([]);
      await expectGone(db, eventId, lea.id);
      await expectInvariants(db, eventId, [answers.first, answers.second]);
    });
  });
});

describe("RP2.8 (5): the device and the organiser removing the same person at once", () => {
  it("the device first: the organiser waits, then gets alreadyRemoved", async () => {
    await withCommittedEvent(async (db, eventId, adminToken) => {
      const { martins, marc } = await seedScene(db, eventId);
      const answers = await inOrder(
        db,
        (trx) => remove(trx, eventId, marc, martins),
        (own) => removeAsOrganiser(own, eventId, { adminToken }, undefined, { personId: marc.id }),
      );
      expect(answers.first).toMatchObject({ ok: true, removal: "removed" });
      expect(answers.second).toMatchObject({ ok: true, removal: "alreadyRemoved" });
      await expectGone(db, eventId, marc.id);
      await expectInvariants(db, eventId, [answers.first, answers.second]);
    });
  });

  it("the organiser first: the device waits, then gets alreadyRemoved", async () => {
    await withCommittedEvent(async (db, eventId, adminToken) => {
      const { martins, marc } = await seedScene(db, eventId);
      const answers = await inOrder(
        db,
        (trx) => removeAsOrganiser(trx, eventId, { adminToken }, undefined, { personId: marc.id }),
        (own) => remove(own, eventId, marc, martins),
      );
      expect(answers.first).toMatchObject({ ok: true, removal: "removed" });
      expect(answers.second).toMatchObject({ ok: true, removal: "alreadyRemoved" });
      await expectGone(db, eventId, marc.id);
      await expectInvariants(db, eventId, [answers.first, answers.second]);
    });
  });

  it("sent together, with no order imposed: one removed and one alreadyRemoved", async () => {
    await withCommittedEvent(async (db, eventId, adminToken) => {
      const { martins, marc } = await seedScene(db, eventId);
      const answers = await Promise.all([
        answerOf(() => remove(db, eventId, marc, martins)),
        answerOf(() => removeAsOrganiser(db, eventId, { adminToken }, undefined, { personId: marc.id })),
      ]);
      const removals = answers.map((answer) => ("removal" in answer ? answer.removal : answer));
      expect(removals.sort()).toEqual(["alreadyRemoved", "removed"]);
      await expectGone(db, eventId, marc.id);
      await expectInvariants(db, eventId, answers);
    });
  });
});

describe("RP2.8 (6): a driver and their passenger removed together", () => {
  it("the driver first: the passenger's removal waits for her Placement, and both succeed", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const { martins, marc, lea, ines } = await seedScene(db, eventId);
      const answers = await inOrder(
        db,
        (trx) => remove(trx, eventId, marc, martins),
        (own) => remove(own, eventId, lea, martins),
      );
      expect(answers.first).toMatchObject({ ok: true, removal: "removed" });
      expect(answers.second).toMatchObject({ ok: true, removal: "removed" });
      expect(await seatOf(db, eventId, ines, "aller")).toBeNull();
      await expectGone(db, eventId, marc.id);
      await expectGone(db, eventId, lea.id);
      await expectInvariants(db, eventId, [answers.first, answers.second]);
    });
  });

  it("the passenger first: the driver's removal waits for her Placement, and both succeed", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const { martins, marc, lea, ines } = await seedScene(db, eventId);
      const answers = await inOrder(
        db,
        (trx) => remove(trx, eventId, lea, martins),
        (own) => remove(own, eventId, marc, martins),
      );
      expect(answers.first).toMatchObject({ ok: true, removal: "removed" });
      expect(answers.second).toMatchObject({ ok: true, removal: "removed" });
      expect(await seatOf(db, eventId, ines, "aller")).toBeNull();
      await expectGone(db, eventId, marc.id);
      await expectGone(db, eventId, lea.id);
      await expectInvariants(db, eventId, [answers.first, answers.second]);
    });
  });
});

/** Marc's car down to 1 seat, Léa chosen to leave, on a step that showed Léa and Inès. */
const reduction = ({ lea, ines }: Scene) => ({
  location: "Mairie de Cesson",
  time: "07:15",
  seats: "1",
  note: "",
  seenPassengerIds: [lea.id, ines.id],
  leaving: [lea.id],
});

async function seatsOf(db: Db, rideId: string) {
  return (await db.selectFrom("ride").select("seats").where("id", "=", rideId).executeTakeFirst())?.seats;
}

describe("RP2.8 (7): a seat reduction that picks a passenger being removed", () => {
  it("the removal committed before the reduction reads its passengers: passengersChanged, with those now", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const scene = await seedScene(db, eventId);
      const { martins, lea, ines, rides } = scene;
      const removal = await answerOf(() => remove(db, eventId, lea));
      const changed = await answerOf(() => updateRide(db, eventId, martins, rides.marcAller, "aller", reduction(scene)));
      expect(removal).toMatchObject({ ok: true, removal: "removed" });
      expect(changed).toMatchObject({ ok: false, error: "passengersChanged", passengerIds: [ines.id] });
      expect(await seatsOf(db, rides.marcAller)).toBe(3);
      await expectGone(db, eventId, lea.id);
      await expectInvariants(db, eventId, [removal, changed]);
    });
  });

  // The removal does not lock the Ride she sits in: the reduction reads her among the passengers,
  // then waits to take her out, and finds her row gone. Decision: no `passengersChanged` here. —
  // Reason: she is out of the car, as the driver chose, and 1 seat holds Inès; the step reopened
  // on [Inès] would ask nobody to leave. No invariant is broken, and nothing fails.
  it("the removal first, while the reduction runs: it waits to take her out, finds her gone, and the car has 1 seat for Inès", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const scene = await seedScene(db, eventId);
      const { martins, lea, ines, rides } = scene;
      const answers = await inOrder(
        db,
        (trx) => remove(trx, eventId, lea),
        (own) => updateRide(own, eventId, martins, rides.marcAller, "aller", reduction(scene)),
      );
      expect(answers.first).toMatchObject({ ok: true, removal: "removed" });
      expect(answers.second).toMatchObject({ ok: true });
      expect(await seatsOf(db, rides.marcAller)).toBe(1);
      expect(await passengersOf(db, eventId, rides.marcAller, "aller")).toEqual([ines.id]);
      await expectGone(db, eventId, lea.id);
      await expectInvariants(db, eventId, [answers.first, answers.second]);
    });
  });

  it("the reduction first: the removal waits for her Placement, and both succeed", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const scene = await seedScene(db, eventId);
      const { martins, lea, ines, rides } = scene;
      const answers = await inOrder(
        db,
        (trx) => updateRide(trx, eventId, martins, rides.marcAller, "aller", reduction(scene)),
        (own) => remove(own, eventId, lea),
      );
      expect(answers.first).toMatchObject({ ok: true });
      expect(answers.second).toMatchObject({ ok: true, removal: "removed" });
      expect(await seatsOf(db, rides.marcAller)).toBe(1);
      expect(await passengersOf(db, eventId, rides.marcAller, "aller")).toEqual([ines.id]);
      await expectGone(db, eventId, lea.id);
      await expectInvariants(db, eventId, [answers.first, answers.second]);
    });
  });
});

/** What the page loaded: the event `seedEvent` stores, whose dates the server's bounds must hold. */
const BEFORE: EventHeader = {
  title: "Tournoi de Rennes",
  location: "Gymnase des Gayeulles",
  allerAt: "2026-12-12 07:30:00",
  retourAt: "2026-12-12 18:00:00",
  locationPosition: null,
  description: null,
};

const WITHOUT_RETOUR = {
  title: BEFORE.title,
  location: BEFORE.location,
  allerDate: "2026-12-12",
  allerTime: "07:30",
  retour: false,
};

/** The retour as the organiser's confirmation counted it: Sophie's car, Sophie, Marc and Léa. */
const SEEN = { cars: 1, persons: 3 };

describe("RP2.8 (8): the retour removed while she is removed", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-21T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("the retour first: the removal waits for the Event, then removes him from the aller", async () => {
    await withCommittedEvent(async (db, eventId, adminToken) => {
      const { marc, lea, ines } = await seedScene(db, eventId);
      const answers = await inOrder(
        db,
        (trx) => editEvent(trx, eventId, { adminToken }, WITHOUT_RETOUR, BEFORE, SEEN),
        (own) => remove(own, eventId, marc),
      );
      expect(answers.first).toMatchObject({ ok: true });
      expect(answers.second).toMatchObject({ ok: true, removal: "removed" });
      expect((await findEventById(db, eventId))?.retour_at).toBeNull();
      expect(await countLegRows(db, eventId, "retour")).toEqual({ cars: 0, persons: 0 });
      for (const passenger of [lea, ines]) expect(await seatOf(db, eventId, passenger, "aller")).toBeNull();
      await expectGone(db, eventId, marc.id);
      await expectInvariants(db, eventId, [answers.first, answers.second]);
    });
  });

  // The confirmation counted 3 persons on the retour, and Marc's removal leaves 2. Decision
  // (coordinator, #767): `confirmRetour` with the new counts, and the retour stays, not « both
  // succeed » as RP2.8 says. — Reason: organizer-view's recount rule wins: counts that changed
  // without falling to zero write nothing, and the organiser confirms again. `confirmRetour` is
  // no `failed`, and a new confirmation then passes. RP2.8 is aligned at remove-person's next revision.
  it("the removal first: the change waits for the Event, counts the retour again, and asks for a new confirmation", async () => {
    await withCommittedEvent(async (db, eventId, adminToken) => {
      const { marc } = await seedScene(db, eventId);
      const answers = await inOrder(
        db,
        (trx) => remove(trx, eventId, marc),
        (own) => editEvent(own, eventId, { adminToken }, WITHOUT_RETOUR, BEFORE, SEEN),
      );
      expect(answers.first).toMatchObject({ ok: true, removal: "removed" });
      expect(answers.second).toEqual({ ok: false, error: "confirmRetour", cars: 1, persons: 2 });
      expect((await findEventById(db, eventId))?.retour_at).toBe(BEFORE.retourAt);
      expect(await countLegRows(db, eventId, "retour")).toEqual({ cars: 1, persons: 2 });
      await expectGone(db, eventId, marc.id);
      await expectInvariants(db, eventId, [answers.first, answers.second]);
    });
  });
});

/*
 * #672, as #836 for editEvent: the organiser's access decided again under the Event's lock, from
 * what was committed while the removal waited for it.
 */
describe("the organiser's access decided again under the Event's lock (#672)", () => {
  it.each([
    ["removes, for a session still open once the lock is obtained", false, { ok: true, removal: "removed" }, []],
    ["answers noOrganiserAccess for a session closed while the removal waited, and removes nobody", true, { ok: false, error: "noOrganiserAccess" }, [1]],
  ])("%s", async (_, closes, expected, left) => {
    await withCommittedAddresses((_, address) =>
      withCommittedEvent(async (db, eventId) => {
        const { marc } = await seedScene(db, eventId);
        const accountId = await seedAccount(db, { email: address() });
        await db.updateTable("event").set({ account_id: accountId, confirmed_at: new Date() }).where("id", "=", eventId).execute();
        const session = await seedSession(db, accountId);
        const answer = await whileHeld(
          db,
          (trx) => lockEvent(trx, eventId, "noKeyUpdate"),
          (own) => removeAsOrganiser(own, eventId, { session }, undefined, { personId: marc.id }),
          async () => {
            if (closes) expect(await closeSession(db, session)).toBe(true);
          },
        );
        expect(answer).toMatchObject(expected);
        const stored = await db.selectFrom("person").select("id").where("id", "=", marc.id).execute();
        expect(stored.map(() => 1)).toEqual(left);
      }),
    );
  });
});
