import { randomBytes, randomUUID } from "node:crypto";
import type { Kysely, Transaction } from "kysely";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readTokenHolders } from "@/db/persons";
import type { Database } from "@/db/schema";
import { withCommittedEvent } from "@/db/test-committed";
import { withRollback } from "@/db/test-db";
import { seedEvent } from "@/db/test-events";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { PERSONAL_TOKEN_BYTES, personalTokenFromBytes } from "@/domain/personal-token";
import { offerRide } from "./actions";
import { readEventState } from "./event-state";
import { stillOpen } from "./test-state";

// The action reaches the database through getDb(): here, the test's transaction, unless
// the test leaves it to the real connection.
const connection = vi.hoisted(() => ({ current: undefined as Kysely<Database> | undefined }));
vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  return { ...actual, getDb: () => connection.current ?? actual.getDb() };
});

afterEach(() => {
  connection.current = undefined;
});

function inTransaction<T>(fn: (trx: Transaction<Database>) => Promise<T>): Promise<T> {
  return withRollback(async (trx) => {
    connection.current = trx;
    return fn(trx);
  });
}

function newToken(): string {
  return personalTokenFromBytes(randomBytes(PERSONAL_TOKEN_BYTES));
}

function anOffer(fields: Record<string, unknown> = {}) {
  return {
    rideId: randomUUID(),
    leg: "aller",
    driver: { kind: "new", personId: randomUUID(), firstName: "Ana", phone: "06 44 44 44 44" },
    location: "Gare de Cesson",
    time: "08:00",
    seats: "3",
    note: "",
    ...fields,
  };
}

async function countsOf(db: Kysely<Database>, eventId: string) {
  const rides = await db.selectFrom("ride").select("id").where("event_id", "=", eventId).execute();
  return { rides: rides.length, persons: (await readTokenHolders(db, eventId)).length };
}

describe("offerRide (action)", () => {
  // readEventState refuses the READ COMMITTED transaction the write runs in: on the real
  // connection, the state can only come from a read after the commit.
  it("writes on the real connection, then gives the state read after the commit", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const lea = await seedPerson(db, eventId, { firstName: "Léa", phone: "06 22 22 22 22" });
      await seedPlacement(db, { personId: lea.id, eventId, leg: "aller", rideId: null });
      const offer = anOffer({ driver: { kind: "device", personId: lea.id } });

      const result = await offerRide(eventId, lea.token, offer);

      expect(result).toEqual({ ok: true, state: await readEventState(db, eventId, lea.token) });
      const aller = result.ok ? stillOpen(result.state)?.legs.find((leg) => leg.leg === "aller") : undefined;
      expect(aller?.cars.map((car) => [car.id, car.driver.id])).toEqual([[offer.rideId, lea.id]]);
      expect(aller?.withoutCar).toEqual([]);
      expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result);
    });
  });

  it("M7.5: noRetour carries the state, and nothing is written", async () => {
    await inTransaction(async (trx) => {
      const { id: eventId } = await seedEvent(trx, { retourAt: null });
      const token = newToken();
      const result = await offerRide(eventId, token, anOffer({ leg: "retour" }));
      expect(result).toEqual({ ok: false, error: "noRetour", state: await readEventState(trx, eventId, token) });
      expect(await countsOf(trx, eventId)).toEqual({ rides: 0, persons: 0 });
    });
  });

  it("RP5.4: personGone carries who is gone and the state, and nothing is written", async () => {
    await inTransaction(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const lea = await seedPerson(trx, eventId, { firstName: "Léa" });
      const gone = randomUUID();
      const result = await offerRide(eventId, lea.token, anOffer({ driver: { kind: "device", personId: lea.id }, passengerIds: [gone] }));
      expect(result).toEqual({ ok: false, error: "personGone", goneIds: [gone], state: await readEventState(trx, eventId, lea.token) });
      expect(await countsOf(trx, eventId)).toEqual({ rides: 0, persons: 1 });
    });
  });

  // v4.8 rule 7: her number emptied elsewhere, the page reads that she has none in the state.
  it("T4.7: driverWithoutPhone carries the state, where she has no number, and none more, and nothing is written", async () => {
    await inTransaction(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const marc = await seedPerson(trx, eventId, { firstName: "Marc", phone: "06 11 11 11 11" });
      await seedRide(trx, eventId, marc.id);
      const claire = await seedPerson(trx, eventId, { firstName: "Claire" });
      await seedPlacement(trx, { personId: claire.id, eventId, leg: "aller", rideId: null });
      const before = await countsOf(trx, eventId);

      const result = await offerRide(eventId, claire.token, anOffer({ driver: { kind: "device", personId: claire.id } }));

      const state = await readEventState(trx, eventId, claire.token);
      expect(result).toEqual({ ok: false, error: "driverWithoutPhone", state });
      const aller = stillOpen(state)?.legs.find((leg) => leg.leg === "aller");
      expect(aller?.device).toEqual([{ id: claire.id, firstName: "Claire", phone: null, state: { kind: "withoutCar" } }]);
      // C10.1: Marc's car is not hers, and his number is not hers to see.
      expect(JSON.stringify(result)).not.toContain("06 11");
      expect(await countsOf(trx, eventId)).toEqual(before);
    });
  });

  // C11.6, as takeSeats: the page shows the state after a refusal, but keeps its form on a field error.
  it("a refusal carries the state read after the commit, a field error does not", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const lea = await seedPerson(db, eventId, { firstName: "Léa", phone: "06 22 22 22 22" });
      const driver = { kind: "device", personId: lea.id };
      expect(await offerRide(eventId, lea.token, anOffer({ driver }))).toMatchObject({ ok: true });
      const state = await readEventState(db, eventId, lea.token);

      const again = anOffer({ driver });
      expect(await offerRide(eventId, lea.token, again)).toEqual({ ok: false, error: "alreadyDriving", state });
      const forged = anOffer({ driver, otherLeg: { kind: "fly" } });
      expect(await offerRide(eventId, lea.token, forged)).toEqual({ ok: false, error: "invalid", state });
      const wrong = anOffer({ driver, leg: "retour", otherLeg: { kind: "drive", rideId: randomUUID(), location: "" } });
      expect(await offerRide(eventId, lea.token, wrong)).toEqual({
        ok: false,
        errors: { otherLocation: "required", otherTime: "required" },
        first: "otherLocation",
      });
    });
  });

  it("C4.7: invalid, nothing is created, with one error per field", async () => {
    await inTransaction(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const before = await countsOf(trx, eventId);
      const offer = anOffer({
        driver: { kind: "new", personId: randomUUID(), firstName: "", phone: "abc" },
        location: "x".repeat(121),
        time: "",
        seats: "0",
        note: "y".repeat(201),
      });
      expect(await offerRide(eventId, newToken(), offer)).toEqual({
        ok: false,
        errors: {
          firstName: "required",
          phone: "invalid",
          location: "tooLong",
          time: "required",
          seats: "outOfRange",
          note: "tooLong",
        },
        first: "firstName",
      });
      expect(await countsOf(trx, eventId)).toEqual(before);
    });
  });

  it("C4.7: an invalid car of a driver of the device gets the car's errors only, the first one first", async () => {
    await inTransaction(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const lea = await seedPerson(trx, eventId);
      const offer = anOffer({ driver: { kind: "device", personId: lea.id }, seats: "deux", time: "7h" });
      expect(await offerRide(eventId, lea.token, offer)).toEqual({
        ok: false,
        errors: { time: "invalid", seats: "invalid" },
        first: "time",
      });
    });
  });

  it.each<[string, unknown]>([
    ["nothing", undefined],
    ["null", null],
    ["a number", 42],
    ["a list", [anOffer()]],
    ["fields of the wrong types", anOffer({ location: 3, time: ["08:00"], seats: {}, note: false })],
  ])("reads %s without throwing", async (_, offer) => {
    await inTransaction(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      await expect(offerRide(eventId, newToken(), offer)).resolves.toMatchObject({ ok: false });
      expect(await countsOf(trx, eventId)).toEqual({ rides: 0, persons: 0 });
    });
  });

  it.each<[string, unknown]>([
    ["a malformed id", "Ab3dEf70"],
    ["an id that is not a string", { id: "Ab3dEf7h" }],
  ])("reads nothing for %s", async (_, id) => {
    connection.current = new Proxy({} as Kysely<Database>, {
      get(_target, property) {
        throw new Error(`the database was used (${String(property)})`);
      },
    });
    await expect(offerRide(id, newToken(), anOffer())).resolves.toEqual({ ok: false, error: "eventNotFound" });
  });

  it("fails with a generic error, without the database's detail nor the token, when the database fails", async () => {
    const token = newToken();
    const detail = "Failing row contains (Ana, 06 44 44 44 44)";
    connection.current = new Proxy({} as Kysely<Database>, {
      get() {
        throw Object.assign(new Error(`relation "ride": ${detail}`), { code: "57P01", detail });
      },
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const driver = { kind: "new", personId: randomUUID(), firstName: "Ana", phone: "06 44 44 44 44" };
      const failure = await offerRide("Ab3dEf7h", token, anOffer({ driver })).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(Error);
      const { message, stack, cause } = failure as Error;
      for (const text of [message, stack]) {
        expect(text).not.toContain("06 44");
        expect(text).not.toContain(token);
      }
      expect(cause).toBeUndefined();
      expect(log.mock.calls).toEqual([["offerRide: the car could not be stored (SQLSTATE 57P01)"]]);
    } finally {
      log.mockRestore();
    }
  });
});
