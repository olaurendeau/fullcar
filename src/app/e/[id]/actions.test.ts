import { randomUUID } from "node:crypto";
import type { Kysely, Transaction } from "kysely";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readTokenHolders } from "@/db/persons";
import type { Database } from "@/db/schema";
import { withRollback } from "@/db/test-db";
import { seedEvent } from "@/db/test-events";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { addPerson, loadEventState, setPersonLeg, takeSeats, updatePerson } from "./actions";
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
  return { eventId, marc, lea, tom, r1 };
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

describe("takeSeats", () => {
  it("C5.2: places the device's person and gives the state the device now sees, in plain data", async () => {
    await inTransaction(async (trx) => {
      const { eventId, tom, r1 } = await seedScene(trx);
      const result = await takeSeats(eventId, tom.token, r1, "aller", [tom.id]);
      expect(result).toEqual({ ok: true, state: await readEventState(trx, eventId, tom.token) });
      expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result);
      const [aller] = result?.state ?? [];
      expect(aller.cars[0].passengers.map((person) => person.firstName).sort()).toEqual(["Léa", "Tom"]);
    });
  });

  it("C2.4: a refusal gives the state too, and places nobody", async () => {
    await inTransaction(async (trx) => {
      const { eventId, lea, tom, r1 } = await seedScene(trx);
      const result = await takeSeats(eventId, lea.token, r1, "aller", [tom.id]);
      expect(result).toEqual({ ok: false, error: "forbidden", state: await readEventState(trx, eventId, lea.token) });
      expect(result?.state[0].withoutCar.map((person) => person.firstName)).toEqual(["Tom"]);
    });
  });

  it.each<[string, unknown]>([
    ["a 0", "Ab3dEf70"],
    ["a number", 12345678],
    ["an object", { id: "Ab3dEf7h" }],
  ])("reads and writes nothing for %s as the id", async (_, id) => {
    connection.current = untouchable;
    await expect(takeSeats(id, undefined, undefined, "aller", [])).resolves.toBeUndefined();
  });

  it("fails with a generic error, without the database's detail nor the token, when the database fails", async () => {
    const token = "AAAAAAAAAAAAAAAAAAAAAA";
    connection.current = failingDb;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const ids = ["0b0b2a4e-6a8f-4c1d-9e2f-3a4b5c6d7e8f", "1c1c2a4e-6a8f-4c1d-9e2f-3a4b5c6d7e8f"];
      const failure = await takeSeats("Ab3dEf7h", token, ids[0], "aller", [ids[1]]).then(
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
      expect(log.mock.calls).toEqual([["takeSeats: the seats could not be taken (SQLSTATE 57P01)"]]);
    } finally {
      log.mockRestore();
    }
  });
});

describe("the person actions", () => {
  const TOKEN = "q3Vx9kLmN2pR7sT1uW4yZQ";
  const registration = (fields: object = {}) => ({ id: randomUUID(), firstName: "Zoé", phone: "", bothLegs: true, leg: "aller", ...fields });
  const kinds = (state: unknown, personId: string) =>
    (state as { leg: string; device: { id: string; state: { kind: string } }[] }[]).map((leg) => [
      leg.leg,
      leg.device.find((person) => person.id === personId)?.state.kind,
    ]);

  it("C1.3: addPerson, « Aller et retour » checked, gives the state with her without a car on both legs", async () => {
    await inTransaction(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const sent = registration();
      const outcome = await addPerson(eventId, TOKEN, sent);
      expect(outcome).toEqual({ ok: true, state: await readEventState(trx, eventId, TOKEN) });
      expect(kinds(outcome.ok && outcome.state, sent.id)).toEqual([["aller", "withoutCar"], ["retour", "withoutCar"]]);
      expect(JSON.parse(JSON.stringify(outcome))).toStrictEqual(outcome);
    });
  });

  it("C1.3: addPerson, unchecked, leaves her not concerned on the other leg", async () => {
    await inTransaction(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const sent = registration({ bothLegs: false });
      const outcome = await addPerson(eventId, TOKEN, sent);
      expect(kinds(outcome.ok && outcome.state, sent.id)).toEqual([["aller", "withoutCar"], ["retour", "notConcerned"]]);
    });
  });

  it("C1.4: addPerson, without a retour, leaves her without a car at the aller", async () => {
    await inTransaction(async (trx) => {
      const { id: eventId } = await seedEvent(trx, { retourAt: null });
      const sent = registration({ bothLegs: true });
      const outcome = await addPerson(eventId, TOKEN, sent);
      expect(kinds(outcome.ok && outcome.state, sent.id)).toEqual([["aller", "withoutCar"]]);
    });
  });

  it("C1.8: addPerson with an empty first name and a malformed number creates nothing, with an error per field", async () => {
    await inTransaction(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const outcome = await addPerson(eventId, TOKEN, registration({ firstName: " ", phone: "06" }));
      expect(outcome).toEqual({ ok: false, errors: { firstName: "required", phone: "invalid" }, first: "firstName" });
      expect(await readTokenHolders(trx, eventId)).toEqual([]);
    });
  });

  it("updatePerson and setPersonLeg give the state after the change", async () => {
    await inTransaction(async (trx) => {
      const { eventId, lea } = await seedScene(trx);
      const renamed = await updatePerson(eventId, lea.token, { personId: lea.id, firstName: "Léonie", phone: "" });
      expect(renamed).toEqual({ ok: true, state: await readEventState(trx, eventId, lea.token) });
      const out = await setPersonLeg(eventId, lea.token, { personId: lea.id, leg: "aller", kind: "notConcerned" });
      expect(kinds(out.ok && out.state, lea.id)).toEqual([["aller", "notConcerned"], ["retour", "notConcerned"]]);
    });
  });

  it.each<[string, unknown]>([
    ["nothing", undefined],
    ["null", null],
    ["a number", 42],
    ["a string", "Zoé"],
    ["a list", ["Zoé"]],
    ["fields of the wrong type", { id: 1, personId: [], firstName: { x: 1 }, phone: 6, bothLegs: "yes", leg: 0, kind: {} }],
  ])("reads %s as fields without throwing", async (_, input) => {
    await inTransaction(async (trx) => {
      const { eventId, lea } = await seedScene(trx);
      for (const action of [addPerson, updatePerson, setPersonLeg]) {
        await expect(action(eventId, lea.token, input)).resolves.toEqual(expect.objectContaining({ ok: false }));
      }
    });
  });

  it.each<[string, unknown]>([
    ["a malformed id", "Ab3dEf70"],
    ["an id that is not a string", { id: "Ab3dEf7h" }],
  ])("reads nothing for %s as the event", async (_, id) => {
    connection.current = untouchable;
    for (const action of [addPerson, updatePerson, setPersonLeg]) {
      await expect(action(id, TOKEN, registration())).resolves.toEqual({ ok: false, error: "eventNotFound" });
    }
  });

  it("fails with a generic error, without the database's detail nor the token, when the database fails", async () => {
    connection.current = failingDb;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const actions = [
        ["addPerson", addPerson],
        ["updatePerson", updatePerson],
        ["setPersonLeg", setPersonLeg],
      ] as const;
      for (const [name, action] of actions) {
        const fields = { ...registration(), personId: randomUUID(), kind: "withoutCar" };
        const failure = await action("Ab3dEf7h", TOKEN, fields).then(
          () => undefined,
          (error: unknown) => error,
        );
        expect(failure).toBeInstanceOf(Error);
        const { message, stack, cause } = failure as Error;
        for (const text of [message, stack]) {
          expect(text).not.toContain("06 22");
          expect(text).not.toContain(TOKEN);
        }
        expect(cause).toBeUndefined();
        expect(log).toHaveBeenLastCalledWith(`${name}: the change could not be written (SQLSTATE 57P01)`);
      }
    } finally {
      log.mockRestore();
    }
  });
});
