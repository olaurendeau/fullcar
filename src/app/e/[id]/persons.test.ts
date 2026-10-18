import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { readTokenHolders } from "@/db/persons";
import type { Database } from "@/db/schema";
import { withCommittedEvent } from "@/db/test-committed";
import { withRollback } from "@/db/test-db";
import { seedEvent } from "@/db/test-events";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import type { Leg } from "@/domain/leg";
import { readEventState, type EventState } from "./event-state";
import { addPerson, setPersonLeg, updatePerson, type PersonOutcome } from "./persons";

type Db = Kysely<Database>;

/** Well-formed (22 base64url characters, the last one canonical), and held by nobody. */
const NOBODYS_TOKEN = "AAAAAAAAAAAAAAAAAAAAAA";
const NEW_TOKEN = "q3Vx9kLmN2pR7sT1uW4yZQ";

function legOf(state: EventState | undefined, leg: Leg) {
  const found = state?.find((board) => board.leg === leg);
  if (found === undefined) throw new Error(`no ${leg} in the state`);
  return found;
}

/** Where the person stands on each leg of the state, as her device sees it. */
function standing(state: EventState | undefined, personId: string): Partial<Record<Leg, string>> {
  const legs: Partial<Record<Leg, string>> = {};
  for (const board of state ?? []) {
    const person = board.device.find((device) => device.id === personId);
    if (person) legs[board.leg] = person.state.kind;
  }
  return legs;
}

function stateOf(outcome: PersonOutcome): EventState {
  if (!outcome.ok) throw new Error(`refused: ${JSON.stringify(outcome)}`);
  return outcome.state;
}

async function personIds(db: Db, eventId: string): Promise<string[]> {
  return (await readTokenHolders(db, eventId)).map((holder) => holder.id);
}

function registration(fields: Record<string, unknown> = {}) {
  return { id: randomUUID(), firstName: "Léa", phone: "", bothLegs: true, leg: "aller", ...fields };
}

/** Marc drives Léa at the aller; Tom is without a car at the aller. Each has their own device. */
async function seedScene(db: Db) {
  const { id: eventId } = await seedEvent(db);
  const marc = await seedPerson(db, eventId, { firstName: "Marc" });
  const lea = await seedPerson(db, eventId, { firstName: "Léa", phone: "06 22 22 22 22" });
  const tom = await seedPerson(db, eventId, { firstName: "Tom" });
  const ride = await seedRide(db, eventId, marc.id, { leg: "aller" });
  await seedPlacement(db, { personId: lea.id, eventId, leg: "aller", rideId: ride });
  await seedPlacement(db, { personId: lea.id, eventId, leg: "retour", rideId: null });
  await seedPlacement(db, { personId: tom.id, eventId, leg: "aller", rideId: null });
  return { eventId, marc, lea, tom, ride };
}

describe("addPerson", () => {
  it("C1.3, C12.3: « Aller et retour » checked, with a token nobody holds yet: without a car on both legs", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const sent = registration();
      const state = stateOf(await addPerson(trx, eventId, NEW_TOKEN, sent));
      expect(standing(state, sent.id)).toEqual({ aller: "withoutCar", retour: "withoutCar" });
      expect(state).toEqual(await readEventState(trx, eventId, NEW_TOKEN));
      expect(legOf(state, "aller").withoutCar).toEqual([{ id: sent.id, firstName: "Léa" }]);
    });
  });

  it("C1.3: unchecked, without a car on the tab's leg, not concerned on the other", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const sent = registration({ bothLegs: false, leg: "retour" });
      const state = stateOf(await addPerson(trx, eventId, NEW_TOKEN, sent));
      expect(standing(state, sent.id)).toEqual({ aller: "notConcerned", retour: "withoutCar" });
    });
  });

  it("C1.4: without a retour, without a car at the aller", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx, { retourAt: null });
      const sent = registration({ bothLegs: false });
      const state = stateOf(await addPerson(trx, eventId, NEW_TOKEN, sent));
      expect(standing(state, sent.id)).toEqual({ aller: "withoutCar" });
    });
  });

  it("stores the trimmed first name and the number", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const sent = registration({ firstName: "  Zoé ", phone: "06 12 34 56 78" });
      const [person] = legOf(stateOf(await addPerson(trx, eventId, NEW_TOKEN, sent)), "aller").device;
      expect(person).toEqual(expect.objectContaining({ id: sent.id, firstName: "Zoé", phone: "06 12 34 56 78" }));
    });
  });

  it.each<[string, Record<string, unknown>, object]>([
    ["an empty first name", { firstName: "  " }, { firstName: "required" }],
    ["a malformed number", { phone: "06 12" }, { phone: "invalid" }],
    ["both", { firstName: "", phone: "abc" }, { firstName: "required", phone: "invalid" }],
  ])("C1.8: %s creates nothing, with an error per field", async (_, fields, errors) => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      expect(await addPerson(trx, eventId, NEW_TOKEN, registration(fields))).toEqual(
        expect.objectContaining({ ok: false, errors }),
      );
      expect(await personIds(trx, eventId)).toEqual([]);
    });
  });

  it("C2.1: a second person with the same token; both are the device's and can be changed", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const first = registration({ firstName: "Léa" });
      const second = registration({ firstName: "Zoé" });
      await addPerson(trx, eventId, NEW_TOKEN, first);
      const state = stateOf(await addPerson(trx, eventId, NEW_TOKEN, second));
      expect(legOf(state, "aller").device.map((person) => person.id).sort()).toEqual([first.id, second.id].sort());
      for (const { id } of [first, second]) {
        const changed = await updatePerson(trx, eventId, NEW_TOKEN, { personId: id, firstName: "Ana", phone: "" });
        expect(changed.ok).toBe(true);
      }
    });
  });

  it.each<[string, unknown]>([
    ["too short", "AAAAAAAAAAAAAAAAAAAAA"],
    ["too long", "AAAAAAAAAAAAAAAAAAAAAAA"],
    ["out of the alphabet", "AAAAAAAAAAAAAAAAAAAA+A"],
    ["not canonical", "AAAAAAAAAAAAAAAAAAAAAB"],
    ["absent", undefined],
    ["not a string", { token: NEW_TOKEN }],
  ])("C12.1: a token %s is refused, and nothing is created", async (_, token) => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      expect(await addPerson(trx, eventId, token, registration())).toEqual(
        expect.objectContaining({ ok: false, error: "forbidden" }),
      );
      expect(await personIds(trx, eventId)).toEqual([]);
    });
  });

  it("C12.4, C1.12: the same creation sent again creates nothing more, and writes nothing", async () => {
    await withRollback(async (trx) => {
      const { eventId, marc, ride } = await seedScene(trx);
      const sent = registration();
      await addPerson(trx, eventId, NEW_TOKEN, sent);
      // Between the two sends, she boards Marc's car: the resend must not take her out of it.
      await seedPlacement(trx, { personId: sent.id, eventId, leg: "aller", rideId: ride });
      const before = await personIds(trx, eventId);

      const again = await addPerson(trx, eventId, NEW_TOKEN, { ...sent, firstName: "Autre", bothLegs: false });
      const state = stateOf(again);
      expect(await personIds(trx, eventId)).toEqual(before);
      const [person] = legOf(state, "aller").device;
      expect(person).toEqual(
        expect.objectContaining({ id: sent.id, firstName: "Léa", state: expect.objectContaining({ kind: "passenger" }) }),
      );
      expect(person.state).toEqual({ kind: "passenger", rideId: ride, driver: { id: marc.id, firstName: "Marc" } });
      expect(standing(state, sent.id).retour).toBe("withoutCar");
    });
  });

  it("C12.4: an id taken by another token of the event is refused, and the person stays as she is", async () => {
    await withRollback(async (trx) => {
      const { eventId, tom } = await seedScene(trx);
      const before = await readEventState(trx, eventId, tom.token);
      const outcome = await addPerson(trx, eventId, NEW_TOKEN, registration({ id: tom.id, firstName: "Intrus" }));
      expect(outcome).toEqual(expect.objectContaining({ ok: false, error: "forbidden" }));
      expect(await readEventState(trx, eventId, tom.token)).toEqual(before);
      expect(standing(await readEventState(trx, eventId, NEW_TOKEN), tom.id)).toEqual({});
    });
  });

  it("C12.4: an id taken in another event is refused, and nothing is created", async () => {
    await withRollback(async (trx) => {
      const other = await seedScene(trx);
      const { id: eventId } = await seedEvent(trx);
      const outcome = await addPerson(trx, eventId, other.tom.token, registration({ id: other.tom.id }));
      expect(outcome).toEqual(expect.objectContaining({ ok: false, error: "forbidden" }));
      expect(await personIds(trx, eventId)).toEqual([]);
    });
  });

  it.each<[string, Record<string, unknown>]>([
    ["a malformed creation id", { id: "not-a-uuid" }],
    ["a creation id that is not a string", { id: 42 }],
    ["an unknown leg", { leg: "ailleurs" }],
  ])("refuses %s, and creates nothing", async (_, fields) => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const outcome = await addPerson(trx, eventId, NEW_TOKEN, registration(fields));
      expect(outcome).toEqual(expect.objectContaining({ ok: false, error: "invalid" }));
      expect(await personIds(trx, eventId)).toEqual([]);
    });
  });

  it("refuses the retour of an event without a retour", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx, { retourAt: null });
      const outcome = await addPerson(trx, eventId, NEW_TOKEN, registration({ bothLegs: false, leg: "retour" }));
      expect(outcome).toEqual(expect.objectContaining({ ok: false, error: "invalid" }));
      expect(await personIds(trx, eventId)).toEqual([]);
    });
  });

  it("refuses an unknown event", async () => {
    await withRollback(async (trx) => {
      expect(await addPerson(trx, "Zz9yXw8v", NEW_TOKEN, registration())).toEqual({ ok: false, error: "eventNotFound" });
    });
  });
});

describe("updatePerson", () => {
  it("C2.3: changes the first name and the number", async () => {
    await withRollback(async (trx) => {
      const { eventId, tom } = await seedScene(trx);
      const fields = { personId: tom.id, firstName: " Thomas ", phone: "07 11 22 33 44" };
      const [person] = legOf(stateOf(await updatePerson(trx, eventId, tom.token, fields)), "aller").device;
      expect(person).toEqual(expect.objectContaining({ id: tom.id, firstName: "Thomas", phone: "07 11 22 33 44" }));
    });
  });

  it("C2.3: an empty number removes it", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea } = await seedScene(trx);
      const fields = { personId: lea.id, firstName: "Léa", phone: "  " };
      const [person] = legOf(stateOf(await updatePerson(trx, eventId, lea.token, fields)), "retour").device;
      expect(person).toEqual(expect.objectContaining({ id: lea.id, phone: null }));
    });
  });

  it("C1.8: refuses an empty first name and a malformed number, with an error per field, and changes nothing", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea } = await seedScene(trx);
      const before = await readEventState(trx, eventId, lea.token);
      const outcome = await updatePerson(trx, eventId, lea.token, { personId: lea.id, firstName: "", phone: "12" });
      expect(outcome).toEqual(expect.objectContaining({ ok: false, errors: { firstName: "required", phone: "invalid" } }));
      expect(await readEventState(trx, eventId, lea.token)).toEqual(before);
    });
  });
});

/** C2.4: every token that did not create the person, and none of them changes anything. */
const STRANGERS: [string, (scene: Awaited<ReturnType<typeof seedScene>>, otherEventToken: string) => unknown][] = [
  ["the token of another person of the event", (scene) => scene.tom.token],
  ["the token of another event", (_, otherEventToken) => otherEventToken],
  ["no token", () => undefined],
  ["a well-formed token nobody holds (C12.3)", () => NOBODYS_TOKEN],
  ["a malformed token", () => "AAAAAAAAAAAAAAAAAAAAA"],
];

describe("C2.4, C7.3, C12.3: only the device that created the person changes her", () => {
  it.each(STRANGERS)("updatePerson refuses %s", async (_, tokenOf) => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      const other = await seedScene(trx);
      const before = await readEventState(trx, scene.eventId, scene.lea.token);
      const outcome = await updatePerson(trx, scene.eventId, tokenOf(scene, other.lea.token), {
        personId: scene.lea.id,
        firstName: "Intrus",
        phone: "",
      });
      expect(outcome).toEqual(expect.objectContaining({ ok: false, error: "forbidden" }));
      expect(await readEventState(trx, scene.eventId, scene.lea.token)).toEqual(before);
    });
  });

  it.each(STRANGERS)("setPersonLeg refuses %s", async (_, tokenOf) => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      const other = await seedScene(trx);
      const before = await readEventState(trx, scene.eventId, scene.lea.token);
      const outcome = await setPersonLeg(trx, scene.eventId, tokenOf(scene, other.lea.token), {
        personId: scene.lea.id,
        leg: "aller",
        kind: "withoutCar",
      });
      expect(outcome).toEqual(expect.objectContaining({ ok: false, error: "forbidden" }));
      expect(await readEventState(trx, scene.eventId, scene.lea.token)).toEqual(before);
    });
  });

  it("refuses a person id nobody holds, with a token of the event", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea } = await seedScene(trx);
      const personId = randomUUID();
      // The refusal carries the device's current state, which nothing changed.
      const refused = { ok: false, error: "forbidden", state: await readEventState(trx, eventId, lea.token) };
      expect(await updatePerson(trx, eventId, lea.token, { personId, firstName: "Ana", phone: "" })).toEqual(refused);
      expect(await setPersonLeg(trx, eventId, lea.token, { personId, leg: "aller", kind: "notConcerned" })).toEqual(refused);
    });
  });
});

describe("setPersonLeg", () => {
  it("C3.1: without a car, then not concerned on this leg; the other leg stays as it was", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea } = await seedScene(trx);
      const before = await readEventState(trx, eventId, lea.token);
      const state = stateOf(await setPersonLeg(trx, eventId, lea.token, { personId: lea.id, leg: "retour", kind: "notConcerned" }));
      expect(standing(state, lea.id).retour).toBe("notConcerned");
      expect(legOf(state, "retour").withoutCar).toEqual([]);
      expect(legOf(state, "aller")).toEqual(legOf(before, "aller"));
    });
  });

  it("C3.2: not concerned, then without a car on this leg; the other leg stays as it was", async () => {
    await withRollback(async (trx) => {
      const { eventId, tom } = await seedScene(trx);
      const before = await readEventState(trx, eventId, tom.token);
      expect(standing(before, tom.id).retour).toBe("notConcerned");
      const state = stateOf(await setPersonLeg(trx, eventId, tom.token, { personId: tom.id, leg: "retour", kind: "withoutCar" }));
      expect(standing(state, tom.id).retour).toBe("withoutCar");
      expect(legOf(state, "retour").withoutCar).toContainEqual({ id: tom.id, firstName: "Tom" });
      expect(legOf(state, "aller")).toEqual(legOf(before, "aller"));
    });
  });

  it("C7.1: a passenger leaves the car: without a car, the seat is free again, the other leg is the same", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, ride } = await seedScene(trx);
      const before = await readEventState(trx, eventId, lea.token);
      const state = stateOf(await setPersonLeg(trx, eventId, lea.token, { personId: lea.id, leg: "aller", kind: "withoutCar" }));
      const aller = legOf(state, "aller");
      expect(standing(state, lea.id).aller).toBe("withoutCar");
      expect(aller.cars.find((car) => car.id === ride)).toEqual(expect.objectContaining({ passengers: [], freeSeats: 3 }));
      expect(aller.withoutCar.map((person) => person.id)).toContain(lea.id);
      expect(legOf(state, "retour")).toEqual(legOf(before, "retour"));
    });
  });

  it("C7.2: a passenger not concerned: the seat is free again and she is on no list of the leg", async () => {
    await withRollback(async (trx) => {
      const { eventId, lea, ride } = await seedScene(trx);
      const before = await readEventState(trx, eventId, lea.token);
      const state = stateOf(await setPersonLeg(trx, eventId, lea.token, { personId: lea.id, leg: "aller", kind: "notConcerned" }));
      const aller = legOf(state, "aller");
      expect(standing(state, lea.id).aller).toBe("notConcerned");
      expect(aller.cars.find((car) => car.id === ride)).toEqual(expect.objectContaining({ passengers: [], freeSeats: 3 }));
      expect(aller.withoutCar.map((person) => person.id)).not.toContain(lea.id);
      expect(legOf(state, "retour")).toEqual(legOf(before, "retour"));
    });
  });

  it.each(["withoutCar", "notConcerned"] as const)("C7.4: %s twice succeeds the second time without a change", async (kind) => {
    await withRollback(async (trx) => {
      const { eventId, lea } = await seedScene(trx);
      const change = { personId: lea.id, leg: "aller", kind };
      const first = stateOf(await setPersonLeg(trx, eventId, lea.token, change));
      expect(stateOf(await setPersonLeg(trx, eventId, lea.token, change))).toEqual(first);
    });
  });

  it.each(["withoutCar", "notConcerned"] as const)("refuses %s for a driver on the leg she drives", async (kind) => {
    await withRollback(async (trx) => {
      const { eventId, marc } = await seedScene(trx);
      const before = await readEventState(trx, eventId, marc.token);
      const outcome = await setPersonLeg(trx, eventId, marc.token, { personId: marc.id, leg: "aller", kind });
      expect(outcome).toEqual({ ok: false, error: "drives", state: before });
      expect(await readEventState(trx, eventId, marc.token)).toEqual(before);
    });
  });

  it("lets the driver of the aller look for a seat at the retour", async () => {
    await withRollback(async (trx) => {
      const { eventId, marc } = await seedScene(trx);
      const state = stateOf(await setPersonLeg(trx, eventId, marc.token, { personId: marc.id, leg: "retour", kind: "withoutCar" }));
      expect(standing(state, marc.id)).toEqual({ aller: "driver", retour: "withoutCar" });
    });
  });

  it.each<[string, Record<string, unknown>]>([
    ["an unknown leg", { leg: "ailleurs" }],
    ["an unknown kind", { kind: "passenger" }],
    ["a malformed person id", { personId: "lea" }],
  ])("refuses %s, and changes nothing", async (_, fields) => {
    await withRollback(async (trx) => {
      const { eventId, lea } = await seedScene(trx);
      const before = await readEventState(trx, eventId, lea.token);
      const outcome = await setPersonLeg(trx, eventId, lea.token, { personId: lea.id, leg: "aller", kind: "withoutCar", ...fields });
      expect(outcome).toEqual(expect.objectContaining({ ok: false, error: "invalid" }));
      expect(await readEventState(trx, eventId, lea.token)).toEqual(before);
    });
  });

  it("refuses the retour of an event without a retour", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx, { retourAt: null });
      const lea = await seedPerson(trx, eventId);
      const outcome = await setPersonLeg(trx, eventId, lea.token, { personId: lea.id, leg: "retour", kind: "withoutCar" });
      expect(outcome).toEqual(expect.objectContaining({ ok: false, error: "invalid" }));
    });
  });
});

describe("C12.4: the same creation sent twice at once", () => {
  /**
   * Resolves once a session waits on a lock (`wait_event_type = 'Lock'`) that the session
   * `pid` holds. Within 3 s, under Vitest's 5 s: a send that never waits fails on this
   * message, and `first` is rolled back before the test ends.
   */
  async function waitingForLockOf(db: Db, pid: number) {
    for (let attempt = 0; attempt < 120; attempt++) {
      const { rows } = await sql<{ pid: number }>`
        select pid from pg_stat_activity
        where wait_event_type = 'Lock' and ${pid}::int = any(pg_blocking_pids(pid))`.execute(db);
      if (rows.length > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error("the second send never waited for the first");
  }

  it("the second waits for the first's insert, then writes nothing: she stays in the car she boarded", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const marc = await seedPerson(db, eventId, { firstName: "Marc" });
      const ride = await seedRide(db, eventId, marc.id, { leg: "aller" });
      const sent = registration();
      // The first send, not committed yet: she is stored, and boards Marc's car.
      const first = await db.startTransaction().execute();
      let second: Promise<PersonOutcome>;
      try {
        await seedPerson(first, eventId, { id: sent.id, firstName: sent.firstName }, NEW_TOKEN);
        await seedPlacement(first, { personId: sent.id, eventId, leg: "aller", rideId: ride });
        await seedPlacement(first, { personId: sent.id, eventId, leg: "retour", rideId: null });
        const { rows } = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(first);
        second = addPerson(db, eventId, NEW_TOKEN, sent);
        second.catch(() => {});
        // The second has reached its insert, which waits on the first's id until it commits.
        await waitingForLockOf(db, rows[0].pid);
        await first.commit().execute();
      } catch (error) {
        await first.rollback().execute();
        throw error;
      }

      const state = stateOf(await second);
      expect(standing(state, sent.id)).toEqual({ aller: "passenger", retour: "withoutCar" });
      expect((await personIds(db, eventId)).sort()).toEqual([marc.id, sent.id].sort());
    });
  });
});

// readEventState reads on one snapshot, and refuses a READ COMMITTED transaction: given the
// connection, each use case commits its write first, then reads the state on its own snapshot.
describe("the state is read after the write is committed", () => {
  it("addPerson, given the connection, returns the state with the committed person", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const sent = registration();
      const state = stateOf(await addPerson(db, eventId, NEW_TOKEN, sent));
      expect(standing(state, sent.id)).toEqual({ aller: "withoutCar", retour: "withoutCar" });
      // Committed: another connection sees her too.
      expect(await personIds(getDb(), eventId)).toEqual([sent.id]);
    });
  });

  it("updatePerson and setPersonLeg, given the connection, return the state after their write", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const lea = await seedPerson(db, eventId);
      await seedPlacement(db, { personId: lea.id, eventId, leg: "aller", rideId: null });
      const renamed = stateOf(await updatePerson(db, eventId, lea.token, { personId: lea.id, firstName: "Zoé", phone: "" }));
      expect(legOf(renamed, "aller").withoutCar).toEqual([{ id: lea.id, firstName: "Zoé" }]);
      const moved = stateOf(await setPersonLeg(db, eventId, lea.token, { personId: lea.id, leg: "aller", kind: "notConcerned" }));
      expect(standing(moved, lea.id)).toEqual({ aller: "notConcerned", retour: "notConcerned" });
    });
  });
});
