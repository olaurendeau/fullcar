import { randomUUID } from "node:crypto";
import type { Kysely, Transaction } from "kysely";
import { afterEach, describe, expect, it, vi } from "vitest";
import { anonymiseEvent } from "@/db/day-thirty";
import { readTokenHolders } from "@/db/persons";
import type { Database } from "@/db/schema";
import { withRollback } from "@/db/test-db";
import { seedEvent } from "@/db/test-events";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import {
  addPerson,
  loadEventState,
  offerRide,
  removePerson,
  removeRide,
  setPersonLeg,
  takeSeats,
  undoSeats,
  updatePerson,
  updateRide,
} from "./actions";
import { readEventState, type EndedEvent, type EventState } from "./event-state";

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

/** The state `loadEventState` gave, failing the test had it said the event ended. */
function notEnded(answer: EventState | EndedEvent | undefined): EventState | undefined {
  if (answer && "ended" in answer) throw new Error("loadEventState said the event ended");
  return answer;
}

describe("loadEventState", () => {
  it("gives the state the device sees, as readEventState reads it, in plain data", async () => {
    await inTransaction(async (trx) => {
      const { eventId, lea } = await seedScene(trx);
      const state = notEnded(await loadEventState(eventId, lea.token));
      expect(state).toEqual(await readEventState(trx, eventId, lea.token));
      expect(JSON.parse(JSON.stringify(state))).toStrictEqual(state);
      const [aller] = state?.legs ?? [];
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
      const state = notEnded(await loadEventState(eventId, token));
      expect(state?.legs.flatMap((leg) => leg.device)).toEqual([]);
      expect(JSON.stringify(state)).not.toMatch(/06 \d\d/);
    });
  });

  // #799, OA8.3: a tab opened before day 30 reads again after it, and anyone holding the link may call it.
  it.each<[string, "lea" | "none"]>([
    ["a device's token", "lea"],
    ["no token", "none"],
  ])("OA8.3: with %s, an anonymised event gives its title and its start, neither its place nor anyone", async (_, who) => {
    await inTransaction(async (trx) => {
      const scene = await seedScene(trx);
      await anonymiseEvent(trx, scene.eventId);
      const state = await loadEventState(scene.eventId, who === "lea" ? scene.lea.token : undefined);
      // Nobody is left once anonymised: the place, which stays in the row, is what could leak.
      expect(state).toStrictEqual({ ended: true, title: "Tournoi de Rennes", allerAt: "2026-12-12 07:30:00" });
      expect(JSON.stringify(state)).not.toContain("Gymnase des Gayeulles");
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
      const [aller] = stateOf(result) ?? [];
      expect(aller.cars[0].passengers.map((person) => person.firstName).sort()).toEqual(["Léa", "Tom"]);
    });
  });

  it("C2.4: a refusal gives the state too, and places nobody", async () => {
    await inTransaction(async (trx) => {
      const { eventId, lea, tom, r1 } = await seedScene(trx);
      const result = await takeSeats(eventId, lea.token, r1, "aller", [tom.id]);
      expect(result).toEqual({ ok: false, error: "forbidden", state: await readEventState(trx, eventId, lea.token) });
      expect(stateOf(result)?.[0].withoutCar.map((person) => person.firstName)).toEqual(["Tom"]);
    });
  });

  it("refuses an unknown event as eventNotFound", async () => {
    await inTransaction(async (trx) => {
      const { tom, r1 } = await seedScene(trx);
      expect(await takeSeats("Zz9yXw8v", tom.token, r1, "aller", [tom.id])).toEqual(EVENT_NOT_FOUND);
    });
  });

  it.each<[string, unknown]>([
    ["a 0", "Ab3dEf70"],
    ["a number", 12345678],
    ["an object", { id: "Ab3dEf7h" }],
  ])("refuses %s as the id as eventNotFound, and reads and writes nothing", async (_, id) => {
    connection.current = untouchable;
    await expect(takeSeats(id, undefined, undefined, "aller", [])).resolves.toEqual(EVENT_NOT_FOUND);
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
    (state as EventState).legs.map((leg) => [
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
      // Without a retour, the form has no « Aller et retour » box, and sends it unchecked.
      const sent = registration({ bothLegs: false });
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

/** What every write action gives for an unknown event (decision on #135 and #138). */
const EVENT_NOT_FOUND = { ok: false, error: "eventNotFound" };

/** The state a result gives, if it gives one. */
function stateOf(result: object): EventState["legs"] | undefined {
  return "state" in result ? (result.state as EventState).legs : undefined;
}

/** The fields the change form sends, with the passengers its step showed. */
function rideForm(fields: Record<string, unknown> = {}) {
  return { location: "Mairie", time: "07:15", seats: "3", note: "", seenPassengerIds: [], leaving: [], ...fields };
}

describe("updateRide", () => {
  it("C8.5: refuses a reduction when a passenger seen left and another boarded, the count unchanged", async () => {
    await inTransaction(async (trx) => {
      const { eventId, marc, lea, tom, r1 } = await seedScene(trx);
      const ben = await seedPerson(trx, eventId, { firstName: "Ben" });
      await seedPlacement(trx, { personId: ben.id, eventId, leg: "aller", rideId: r1 });
      // The step showed Léa and Ben; then Ben left and Tom boarded: still two passengers.
      const seenPassengerIds = [lea.id, ben.id];
      await seedPlacement(trx, { personId: ben.id, eventId, leg: "aller", rideId: null });
      await seedPlacement(trx, { personId: tom.id, eventId, leg: "aller", rideId: r1 });

      const result = await updateRide(eventId, marc.token, r1, "aller", rideForm({ seats: "1", seenPassengerIds, leaving: [lea.id] }));

      expect(result).toMatchObject({ ok: false, error: "passengersChanged" });
      expect(result && "passengerIds" in result && [...result.passengerIds].sort()).toEqual([lea.id, tom.id].sort());
      expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result);
      const car = stateOf(result)?.[0].cars[0];
      expect(car?.passengers.map((person) => person.firstName).sort()).toEqual(["Léa", "Tom"]);
      expect(car?.seats).toBe(3);
    });
  });

  it("refuses as invalid a form that does not send the passengers its step showed", async () => {
    await inTransaction(async (trx) => {
      const { eventId, marc, r1 } = await seedScene(trx);
      const result = await updateRide(eventId, marc.token, r1, "aller", rideForm({ seats: "1", seenPassengerIds: undefined }));
      expect(result).toMatchObject({ ok: false, error: "invalid" });
    });
  });

  it("gives eventNotFound for an unknown event", async () => {
    await inTransaction(async (trx) => {
      const { marc, r1 } = await seedScene(trx);
      expect(await updateRide("Zz9yXw8v", marc.token, r1, "aller", rideForm())).toEqual(EVENT_NOT_FOUND);
    });
  });

  it("gives eventNotFound for a malformed event id, without reading anything", async () => {
    connection.current = untouchable;
    await expect(updateRide("Ab3dEf70", undefined, undefined, "aller", rideForm())).resolves.toEqual(EVENT_NOT_FOUND);
  });
});

describe("removeRide", () => {
  it("C8.6: removes the driver's car and gives the state the device now sees, in plain data", async () => {
    await inTransaction(async (trx) => {
      const { eventId, marc, r1 } = await seedScene(trx);
      const result = await removeRide(eventId, marc.token, r1, "aller");
      expect(result).toEqual({ ok: true, state: await readEventState(trx, eventId, marc.token) });
      expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result);
      expect(stateOf(result)?.[0].withoutCar.map((person) => person.firstName).sort()).toEqual(["Léa", "Tom"]);
    });
  });

  it("C8.1: refuses a passenger's token, and the car stays", async () => {
    await inTransaction(async (trx) => {
      const { eventId, lea, r1 } = await seedScene(trx);
      const result = await removeRide(eventId, lea.token, r1, "aller");
      expect(result).toMatchObject({ ok: false, error: "forbidden" });
      expect(stateOf(result)?.[0].cars.map((car) => car.id)).toEqual([r1]);
    });
  });

  it("gives eventNotFound for an unknown event", async () => {
    await inTransaction(async (trx) => {
      const { marc, r1 } = await seedScene(trx);
      expect(await removeRide("Zz9yXw8v", marc.token, r1, "aller")).toEqual(EVENT_NOT_FOUND);
    });
  });

  it("gives eventNotFound for a malformed event id, without reading anything", async () => {
    connection.current = untouchable;
    await expect(removeRide({ id: "Ab3dEf7h" }, undefined, undefined, "aller")).resolves.toEqual(EVENT_NOT_FOUND);
  });
});

describe("removePerson", () => {
  it("RP1.5: removes Léa, her seat freed, and gives the state the device now sees, in plain data", async () => {
    await inTransaction(async (trx) => {
      const { eventId, lea, r1 } = await seedScene(trx);
      const result = await removePerson(eventId, lea.token, lea.id);
      expect(result).toEqual({ ok: true, removal: "removed", state: await readEventState(trx, eventId, lea.token) });
      expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result);
      const [aller] = stateOf(result) ?? [];
      expect(aller.cars.find((car) => car.id === r1)?.passengers).toEqual([]);
      expect(aller.device).toEqual([]);
      expect(await readTokenHolders(trx, eventId)).not.toContainEqual(expect.objectContaining({ id: lea.id }));
    });
  });

  it("RP1.8: removing her again is alreadyRemoved, a success that writes nothing", async () => {
    await inTransaction(async (trx) => {
      const { eventId, lea } = await seedScene(trx);
      await removePerson(eventId, lea.token, lea.id);
      expect(await removePerson(eventId, lea.token, lea.id)).toMatchObject({ ok: true, removal: "alreadyRemoved" });
    });
  });

  it("RP3.1: refuses the person of another token, and she stays", async () => {
    await inTransaction(async (trx) => {
      const { eventId, lea, tom } = await seedScene(trx);
      expect(await removePerson(eventId, tom.token, lea.id)).toEqual({ ok: false, error: "forbidden" });
      expect((await readTokenHolders(trx, eventId)).map((holder) => holder.id)).toContain(lea.id);
    });
  });

  it("gives eventNotFound for a malformed event id, without reading anything", async () => {
    connection.current = untouchable;
    await expect(removePerson({ id: "Ab3dEf7h" }, undefined, undefined)).resolves.toEqual(EVENT_NOT_FOUND);
  });

  it("fails with a generic error, without the database's detail nor the token, when the database fails", async () => {
    const token = "AAAAAAAAAAAAAAAAAAAAAA";
    connection.current = failingDb;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const failure = await removePerson("Ab3dEf7h", token, "0b0b2a4e-6a8f-4c1d-9e2f-3a4b5c6d7e8f").then(
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
      expect(log.mock.calls).toEqual([["removePerson: the person could not be removed (SQLSTATE 57P01)"]]);
    } finally {
      log.mockRestore();
    }
  });
});

describe.each<[string, string, (token: string, rideId: string) => Promise<unknown>]>([
  [
    "updateRide",
    "updateRide: the car could not be changed",
    (token, rideId) => updateRide("Ab3dEf7h", token, rideId, "aller", rideForm()),
  ],
  ["removeRide", "removeRide: the car could not be removed", (token, rideId) => removeRide("Ab3dEf7h", token, rideId, "aller")],
])("%s", (_, logged, action) => {
  it("fails with a generic error, without the database's detail nor the token, when the database fails", async () => {
    const token = "AAAAAAAAAAAAAAAAAAAAAA";
    connection.current = failingDb;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const failure = await action(token, "0b0b2a4e-6a8f-4c1d-9e2f-3a4b5c6d7e8f").then(
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
      expect(log.mock.calls).toEqual([[`${logged} (SQLSTATE 57P01)`]]);
    } finally {
      log.mockRestore();
    }
  });
});

describe("undoSeats", () => {
  it("C5.10: gives Léa her state before, and the state the device now sees, in plain data", async () => {
    await inTransaction(async (trx) => {
      const { eventId, lea, r1 } = await seedScene(trx);
      const result = await undoSeats(eventId, lea.token, r1, "aller", [{ personId: lea.id, before: "withoutCar" }]);
      expect(result).toEqual({ ok: true, undoneIds: [lea.id], state: await readEventState(trx, eventId, lea.token) });
      expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result);
      expect(stateOf(result)?.[0].withoutCar.map((person) => person.firstName).sort()).toEqual(["Léa", "Tom"]);
    });
  });

  it("C7.3: refuses another device's token, and Léa stays in the car", async () => {
    await inTransaction(async (trx) => {
      const { eventId, lea, tom, r1 } = await seedScene(trx);
      const result = await undoSeats(eventId, tom.token, r1, "aller", [{ personId: lea.id, before: "withoutCar" }]);
      expect(result).toMatchObject({ ok: false, error: "forbidden" });
      expect(stateOf(result)?.[0].cars[0].passengers.map((person) => person.firstName)).toEqual(["Léa"]);
    });
  });

  it.each<[string, unknown, unknown, unknown]>([
    ["nothing", undefined, undefined, undefined],
    ["null", null, null, null],
    ["numbers", 42, 7, 3],
    ["a string as the list", "r1", "aller", "Léa"],
    ["objects", { id: "r1" }, { leg: "aller" }, { personId: "Léa" }],
  ])("reads %s as input without an error, as invalid", async (_, rideId, leg, persons) => {
    await inTransaction(async (trx) => {
      const { eventId, lea } = await seedScene(trx);
      expect(await undoSeats(eventId, lea.token, rideId, leg, persons)).toMatchObject({ ok: false, error: "invalid" });
    });
  });

  it("gives eventNotFound for an unknown event", async () => {
    await inTransaction(async (trx) => {
      const { lea, r1 } = await seedScene(trx);
      const persons = [{ personId: lea.id, before: "withoutCar" }];
      expect(await undoSeats("Zz9yXw8v", lea.token, r1, "aller", persons)).toEqual(EVENT_NOT_FOUND);
    });
  });

  it("gives eventNotFound for a malformed event id, without reading anything", async () => {
    connection.current = untouchable;
    await expect(undoSeats({ id: "Ab3dEf7h" }, undefined, undefined, "aller", [])).resolves.toEqual(EVENT_NOT_FOUND);
  });

  it("fails with a generic error, without the database's detail nor the token, when the database fails", async () => {
    const token = "AAAAAAAAAAAAAAAAAAAAAA";
    connection.current = failingDb;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const persons = [{ personId: "1c1c2a4e-6a8f-4c1d-9e2f-3a4b5c6d7e8f", before: "withoutCar" }];
      const failure = await undoSeats("Ab3dEf7h", token, "0b0b2a4e-6a8f-4c1d-9e2f-3a4b5c6d7e8f", "aller", persons).then(
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
      expect(log.mock.calls).toEqual([["undoSeats: the seats could not be given back (SQLSTATE 57P01)"]]);
    } finally {
      log.mockRestore();
    }
  });
});

/** The event of `seedScene` once anonymised, as anyone holding its link may read it (OA8.3). */
const ENDED: EndedEvent = { ended: true, title: "Tournoi de Rennes", allerAt: "2026-12-12 07:30:00" };

type Scene = Awaited<ReturnType<typeof seedScene>>;

// #806, OA8.3: anyone holding the link may call these actions; the place, which stays in the row, may be someone's address.
describe.each<[string, (scene: Scene) => Promise<unknown>]>([
  ["takeSeats", ({ eventId, tom, r1 }) => takeSeats(eventId, tom.token, r1, "aller", [tom.id])],
  ["undoSeats", ({ eventId, lea, r1 }) => undoSeats(eventId, lea.token, r1, "aller", [{ personId: lea.id, before: "withoutCar" }])],
  [
    "addPerson",
    ({ eventId }) =>
      addPerson(eventId, "q3Vx9kLmN2pR7sT1uW4yZQ", { id: randomUUID(), firstName: "Zoé", phone: "", bothLegs: true, leg: "aller" }),
  ],
  ["updatePerson", ({ eventId, lea }) => updatePerson(eventId, lea.token, { personId: lea.id, firstName: "Léonie", phone: "" })],
  ["setPersonLeg", ({ eventId, tom }) => setPersonLeg(eventId, tom.token, { personId: tom.id, leg: "aller", kind: "notConcerned" })],
  [
    "offerRide",
    ({ eventId, tom }) =>
      offerRide(eventId, tom.token, {
        rideId: randomUUID(),
        leg: "aller",
        driver: { kind: "device", personId: tom.id },
        location: "Salle Paul Bert",
        time: "07:00",
        seats: "3",
        note: "",
      }),
  ],
  ["updateRide", ({ eventId, marc, r1 }) => updateRide(eventId, marc.token, r1, "aller", rideForm())],
  ["removeRide", ({ eventId, marc, r1 }) => removeRide(eventId, marc.token, r1, "aller")],
])("%s on an anonymised event (#806)", (_, action) => {
  it("OA8.3: refuses it by eventEnded, with the event ended, neither its place nor anyone", async () => {
    await inTransaction(async (trx) => {
      const scene = await seedScene(trx);
      await anonymiseEvent(trx, scene.eventId);
      const answer = await action(scene);
      expect(answer).toStrictEqual({ ok: false, error: "eventEnded", state: ENDED });
      expect(JSON.stringify(answer)).not.toContain("Gymnase des Gayeulles");
    });
  });
});

// #806: its refusal by eventEnded (RP2.9) comes with #674; meanwhile, what it answers carries no place either.
describe("removePerson on an anonymised event (#806)", () => {
  it("OA8.3: answers the event ended at most, neither its place nor anyone", async () => {
    await inTransaction(async (trx) => {
      const scene = await seedScene(trx);
      await anonymiseEvent(trx, scene.eventId);
      const answer = await removePerson(scene.eventId, scene.lea.token, scene.lea.id);
      expect(JSON.stringify(answer)).not.toContain("Gymnase des Gayeulles");
      if ("state" in answer) expect(answer.state).toStrictEqual(ENDED);
    });
  });
});
