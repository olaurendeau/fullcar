import { sql, type Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { updatePerson } from "@/db/persons";
import type { Database } from "@/db/schema";
import { withRollback } from "@/db/test-db";
import { seedEvent } from "@/db/test-events";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { atomically } from "@/db/transaction";
import type { Leg } from "@/domain/leg";
import { legIsEmpty, type OrganiserPanelAnswer } from "@/domain/organiser-panel";
import { readOrganiserState } from "./organiser-state";

type Db = Kysely<Database>;

/** A connection that fails the test as soon as anything reaches for it. */
const untouchable = new Proxy({} as Db, {
  get(_, property) {
    throw new Error(`the database was used (${String(property)})`);
  },
});

const PHONES = {
  a: "06 11 11 11 11",
  b: "06 22 22 22 22",
  c: "07 33 33 33 33",
  e: "+33 6 55 55 55 55",
} as const;
type Name = keyof typeof PHONES;

/**
 * O2.5: everybody has a number but D.
 * Aller: A drives B and E; C, then D, are without a car.
 * Retour: B is without a car; A, C, D and E are not concerned.
 */
async function seedScene(db: Db) {
  const event = await seedEvent(db);
  const eventId = event.id;
  const a = await seedPerson(db, eventId, { firstName: "A", phone: PHONES.a });
  const b = await seedPerson(db, eventId, { firstName: "B", phone: PHONES.b });
  const c = await seedPerson(db, eventId, { firstName: "C", phone: PHONES.c });
  const d = await seedPerson(db, eventId, { firstName: "D", phone: null });
  const e = await seedPerson(db, eventId, { firstName: "E", phone: PHONES.e });
  const ride = await seedRide(db, eventId, a.id, { leg: "aller", seats: 3 });
  await seedPlacement(db, { personId: b.id, eventId, leg: "aller", rideId: ride });
  await seedPlacement(db, { personId: e.id, eventId, leg: "aller", rideId: ride });
  await seedPlacement(db, { personId: c.id, eventId, leg: "aller", rideId: null });
  await seedPlacement(db, { personId: d.id, eventId, leg: "aller", rideId: null });
  // now() is the transaction's: D declares a second after C, so that the order is theirs.
  await db
    .updateTable("placement")
    .set({ placed_at: sql<Date>`now() + interval '1 second'` })
    .where("person_id", "=", d.id)
    .execute();
  await seedPlacement(db, { personId: b.id, eventId, leg: "retour", rideId: null });
  return { eventId, token: event.token, a, b, c, d, e, ride };
}

function oneCharOff(token: string): string {
  return `${token.slice(0, -1)}${token.at(-1) === "A" ? "B" : "A"}`;
}

function digits(text: string): string {
  return text.replace(/\D/g, "");
}

/** Whose digits appear anywhere in the answer, once serialized as the action's result is. */
function sentNumbers(answer: unknown): Name[] {
  const sent = digits(JSON.stringify(answer) ?? "");
  return (Object.keys(PHONES) as Name[]).filter((name) => sent.includes(digits(PHONES[name])));
}

function legOf(answer: OrganiserPanelAnswer, leg: Leg) {
  if (answer.state !== "panel") throw new Error(`the answer is ${answer.state}`);
  const found = answer.legs.find((candidate) => candidate.leg === leg);
  if (found === undefined) throw new Error(`no ${leg} in the answer`);
  return found;
}

describe("readOrganiserState", () => {
  it("O2.5, O3.4: with the right token, the numbers of the persons without a car, on their leg only", async () => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      const answer = await readOrganiserState(trx, scene.eventId, scene.token);
      expect(answer).toStrictEqual({
        state: "panel",
        legs: [
          {
            leg: "aller",
            coverage: { withoutCar: 2, freeSeats: 1 },
            carCount: 1,
            withoutCar: [
              { id: scene.c.id, firstName: "C", phone: PHONES.c },
              { id: scene.d.id, firstName: "D", phone: null },
            ],
            // A has a number: their car is counted, never listed.
            carsWithoutPhone: [],
          },
          {
            leg: "retour",
            coverage: { withoutCar: 1, freeSeats: 0 },
            carCount: 0,
            withoutCar: [{ id: scene.b.id, firstName: "B", phone: PHONES.b }],
            carsWithoutPhone: [],
          },
        ],
      });
      expect(sentNumbers(answer)).toEqual(["b", "c"]);
    });
  });

  it.each([
    ["a token one character off", oneCharOff],
    ["no token", () => undefined],
  ])("O2.6: with %s, invalid and nothing else", async (_, tokenOf) => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      const answer = await readOrganiserState(trx, scene.eventId, tokenOf(scene.token));
      expect(answer).toStrictEqual({ state: "invalid" });
      expect(sentNumbers(answer)).toEqual([]);
    });
  });

  it("O2.7: once C has taken a seat at the aller, the next read no longer carries C's number", async () => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      expect(sentNumbers(await readOrganiserState(trx, scene.eventId, scene.token))).toContain("c");
      await seedPlacement(trx, { personId: scene.c.id, eventId: scene.eventId, leg: "aller", rideId: scene.ride });
      const answer = await readOrganiserState(trx, scene.eventId, scene.token);
      expect(sentNumbers(answer)).toEqual(["b"]);
      expect(legOf(answer, "aller").withoutCar.map((person) => person.firstName)).toEqual(["D"]);
    });
  });

  it("O3.1, O3.5: the cars whose driver has no number, by departure time, until the driver adds one", async () => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      const eventId = scene.eventId;
      const f = await seedPerson(trx, eventId, { firstName: "F", phone: null });
      const g = await seedPerson(trx, eventId, { firstName: "G", phone: null });
      const late = await seedRide(trx, eventId, f.id, { leg: "retour", departureTime: "19:00:00", seats: 3 });
      const early = await seedRide(trx, eventId, g.id, {
        leg: "retour",
        departureTime: "18:15:00",
        location: "Gare",
        seats: 2,
      });
      await seedPlacement(trx, { personId: scene.b.id, eventId, leg: "retour", rideId: late });

      const retour = legOf(await readOrganiserState(trx, eventId, scene.token), "retour");
      expect(retour.carCount).toBe(2);
      expect(retour.carsWithoutPhone).toStrictEqual([
        { id: early, driverFirstName: "G", departureTime: "18:15:00", location: "Gare", taken: 0, free: 2 },
        { id: late, driverFirstName: "F", departureTime: "19:00:00", location: "Mairie de Cesson", taken: 1, free: 2 },
      ]);

      await updatePerson(trx, { id: g.id, eventId }, { firstName: "G", phone: "06 77 77 77 77" });
      const after = legOf(await readOrganiserState(trx, eventId, scene.token), "retour");
      expect(after.carsWithoutPhone.map((car) => car.id)).toEqual([late]);
      expect(after.carCount).toBe(2);
    });
  });

  it("O1.5, O1.7: an event without a retour and without anybody has one leg, empty", async () => {
    await withRollback(async (trx) => {
      const { id, token } = await seedEvent(trx, { retourAt: null });
      const answer = await readOrganiserState(trx, id, token);
      expect(answer.state === "panel" && answer.legs.map((leg) => leg.leg)).toEqual(["aller"]);
      expect(legIsEmpty(legOf(answer, "aller"))).toBe(true);
    });
  });

  it("O1.6: persons without a car and no car: carCount is 0, and the leg is not empty", async () => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      const retour = legOf(await readOrganiserState(trx, scene.eventId, scene.token), "retour");
      expect(retour.carCount).toBe(0);
      expect(legIsEmpty(retour)).toBe(false);
    });
  });

  it("O2.10: writes nothing", async () => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      // Every column of every row the panel reads: any write to them, an UPDATE included, shows.
      const rows = async () => ({
        event: await trx.selectFrom("event").selectAll().where("id", "=", scene.eventId).execute(),
        person: await trx.selectFrom("person").selectAll().where("event_id", "=", scene.eventId).orderBy("id").execute(),
        ride: await trx.selectFrom("ride").selectAll().where("event_id", "=", scene.eventId).orderBy("id").execute(),
        placement: await trx
          .selectFrom("placement")
          .selectAll()
          .where("event_id", "=", scene.eventId)
          .orderBy("person_id")
          .orderBy("leg")
          .execute(),
      });
      const before = await rows();
      expect(Object.values(before).map((table) => table.length)).toEqual([1, 5, 1, 5]);
      await readOrganiserState(trx, scene.eventId, scene.token);
      await readOrganiserState(trx, scene.eventId, oneCharOff(scene.token));
      expect(await rows()).toStrictEqual(before);
    });
  });

  // #586: a revoked token is a null hash, which no token matches.
  it("answers invalid for the event's own token once revoked, and nothing else", async () => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      await trx.updateTable("event").set({ admin_token_hash: null }).where("id", "=", scene.eventId).execute();
      const answer = await readOrganiserState(trx, scene.eventId, scene.token);
      expect(answer).toStrictEqual({ state: "invalid" });
      expect(sentNumbers(answer)).toEqual([]);
    });
  });

  it("answers invalid for a well-formed id that is not stored, even with another event's token", async () => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      expect(await readOrganiserState(trx, "Zz9yXw8v", scene.token)).toStrictEqual({ state: "invalid" });
    });
  });

  it("answers invalid for a malformed id, without reading the database", async () => {
    await expect(readOrganiserState(untouchable, "Ab3dEf70", "AAAAAAAAAAAAAAAAAAAAAA")).resolves.toStrictEqual({
      state: "invalid",
    });
  });

  it("refuses to read in a READ COMMITTED transaction, rather than mixing snapshots", async () => {
    await expect(atomically(getDb(), (trx) => readOrganiserState(trx, "Zz9yXw8v", undefined))).rejects.toThrow(
      "onOneSnapshot: the transaction given is in read committed, not repeatable read",
    );
  });
});
