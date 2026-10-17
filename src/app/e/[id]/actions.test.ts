import type { Kysely, Transaction } from "kysely";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/schema";
import { withRollback } from "@/db/test-db";
import { seedEvent } from "@/db/test-events";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { loadEventState } from "./actions";
import { readEventState } from "./event-state";

// The action reaches the database through getDb(): here, the test's transaction,
// so that nothing it reads comes from another test.
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

/** A connection that fails the test as soon as anything reaches for it. */
const untouchable = new Proxy({} as Kysely<Database>, {
  get(_, property) {
    throw new Error(`the database was used (${String(property)})`);
  },
});

/** A database whose every use fails with what a Postgres error carries. */
const POSTGRES_DETAIL = "Failing row contains (Ab3dEf7h, Léa, 06 22 22 22 22)";
const failingDb = new Proxy({} as Kysely<Database>, {
  get() {
    throw Object.assign(new Error(`relation "person": ${POSTGRES_DETAIL}`), { code: "57P01", detail: POSTGRES_DETAIL });
  },
});

/** Marc drives Léa at the aller; Tom is without a car. Each has their own device. */
async function seedScene(trx: Transaction<Database>) {
  const { id: eventId } = await seedEvent(trx);
  const marc = await seedPerson(trx, eventId, { firstName: "Marc", phone: "06 11 11 11 11" });
  const lea = await seedPerson(trx, eventId, { firstName: "Léa", phone: "06 22 22 22 22" });
  const tom = await seedPerson(trx, eventId, { firstName: "Tom", phone: "06 33 33 33 33" });
  const r1 = await seedRide(trx, eventId, marc.id);
  await seedPlacement(trx, { personId: lea.id, eventId, leg: "aller", rideId: r1 });
  await seedPlacement(trx, { personId: tom.id, eventId, leg: "aller", rideId: null });
  return { eventId, marc, lea, tom };
}

describe("loadEventState", () => {
  it("gives the state the device sees, as readEventState reads it, in plain data", async () => {
    await inTransaction(async (trx) => {
      const { eventId, lea } = await seedScene(trx);
      const state = await loadEventState(eventId, lea.token);
      expect(state).toEqual(await readEventState(trx, eventId, lea.token));
      expect(JSON.parse(JSON.stringify(state))).toStrictEqual(state);
      const [aller] = state ?? [];
      expect(aller.device.map((person) => person.id)).toEqual([lea.id]);
    });
  });

  it("C10.1: sends the numbers of the device's car, and not Tom's", async () => {
    await inTransaction(async (trx) => {
      const { eventId, lea } = await seedScene(trx);
      const sent = JSON.stringify(await loadEventState(eventId, lea.token));
      expect(sent).toContain("06 11 11 11 11");
      expect(sent).toContain("06 22 22 22 22");
      expect(sent).not.toContain("06 33 33 33 33");
    });
  });

  it.each<[string, unknown]>([
    ["no token", undefined],
    ["null", null],
    ["a number", 42],
    ["an object", { token: "AAAAAAAAAAAAAAAAAAAAAA" }],
  ])("C10.6: with %s, the device has no person and no number is sent", async (_, token) => {
    await inTransaction(async (trx) => {
      const { eventId } = await seedScene(trx);
      const state = await loadEventState(eventId, token);
      expect(state?.flatMap((leg) => leg.device)).toEqual([]);
      expect(JSON.stringify(state)).not.toMatch(/06 \d\d/);
    });
  });

  it("gives nothing for an unknown event", async () => {
    await inTransaction(async (trx) => {
      await seedScene(trx);
      expect(await loadEventState("Zz9yXw8v", undefined)).toBeUndefined();
    });
  });

  it.each<[string, unknown]>([
    ["a 0", "Ab3dEf70"],
    ["9 symbols", "Ab3dEf7hj"],
    ["an empty id", ""],
    ["a number", 12345678],
    ["an object", { id: "Ab3dEf7h" }],
  ])("reads nothing for %s as the id", async (_, id) => {
    connection.current = untouchable;
    await expect(loadEventState(id, undefined)).resolves.toBeUndefined();
  });

  it("fails with a generic error, without the database's detail nor the token, when the database fails", async () => {
    const token = "AAAAAAAAAAAAAAAAAAAAAA";
    connection.current = failingDb;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const failure = await loadEventState("Ab3dEf7h", token).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(Error);
      const { message, stack, cause } = failure as Error;
      for (const text of [message, stack]) {
        expect(text).not.toContain("06 22");
        expect(text).not.toContain(token);
      }
      expect(cause).toBeUndefined();
      expect(log.mock.calls).toEqual([["loadEventState: the event could not be read (SQLSTATE 57P01)"]]);
    } finally {
      log.mockRestore();
    }
  });
});
