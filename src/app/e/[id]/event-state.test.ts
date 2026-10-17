import { sql, TableNode, type Kysely, type KyselyPlugin, type QueryId } from "kysely";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import type { Database } from "@/db/schema";
import { withCommittedEvent } from "@/db/test-committed";
import { withRollback } from "@/db/test-db";
import { seedEvent } from "@/db/test-events";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { atomically } from "@/db/transaction";
import { buildBoard } from "@/domain/board";
import type { Leg } from "@/domain/leg";
import { withVisiblePhones, type VisibleBoard } from "@/domain/phone-visibility";
import { readEventState } from "./event-state";

// Passed through, and watched: the board and the numbers must follow the same device.
vi.mock("@/domain/board", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/board")>();
  return { ...actual, buildBoard: vi.fn(actual.buildBoard) };
});
vi.mock("@/domain/phone-visibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/phone-visibility")>();
  return { ...actual, withVisiblePhones: vi.fn(actual.withVisiblePhones) };
});

beforeEach(() => {
  vi.mocked(buildBoard).mockClear();
  vi.mocked(withVisiblePhones).mockClear();
});

type Db = Kysely<Database>;

/** A connection that fails the test as soon as anything reaches for it. */
const untouchable = new Proxy({} as Db, {
  get(_, property) {
    throw new Error(`the database was used (${String(property)})`);
  },
});

/** Well-formed (22 base64url characters, the last one canonical), and held by nobody. */
const NOBODYS_TOKEN = "AAAAAAAAAAAAAAAAAAAAAA";

const PHONES = {
  marc: "06 11 11 11 11",
  lea: "06 22 22 22 22",
  zoe: "07 55 55 55 55",
  tom: "+33 6 33 33 33 33",
} as const;
type Name = keyof typeof PHONES;

/**
 * Aller: Marc drives Léa (r1), Tom is without a car, Zoé is not concerned.
 * Retour: Zoé drives Tom (r2), Léa is without a car, Marc is not concerned.
 * Léa and Zoé are the persons of one device; Marc and Tom each have their own.
 */
async function seedScene(db: Db) {
  const { id: eventId } = await seedEvent(db);
  const marc = await seedPerson(db, eventId, { firstName: "Marc", phone: PHONES.marc });
  const lea = await seedPerson(db, eventId, { firstName: "Léa", phone: PHONES.lea });
  const zoe = await seedPerson(db, eventId, { firstName: "Zoé", phone: PHONES.zoe }, lea.token);
  const tom = await seedPerson(db, eventId, { firstName: "Tom", phone: PHONES.tom });
  const r1 = await seedRide(db, eventId, marc.id, { leg: "aller" });
  const r2 = await seedRide(db, eventId, zoe.id, { leg: "retour", departureTime: "18:30:00" });
  await seedPlacement(db, { personId: lea.id, eventId, leg: "aller", rideId: r1 });
  await seedPlacement(db, { personId: tom.id, eventId, leg: "aller", rideId: null });
  await seedPlacement(db, { personId: tom.id, eventId, leg: "retour", rideId: r2 });
  await seedPlacement(db, { personId: lea.id, eventId, leg: "retour", rideId: null });
  return { eventId, marc, lea, zoe, tom, r1, r2 };
}

function digits(text: string): string {
  return text.replace(/\D/g, "");
}

/** Every string of the value, once serialized as the action's result would be. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (typeof value === "object" && value !== null) return Object.values(value).flatMap(strings);
  return [];
}

/** Whose digits appear anywhere in the serialized value. */
function sentNumbers(value: unknown): Name[] {
  const sent = strings(JSON.parse(JSON.stringify(value) ?? "null")).map(digits);
  const names = Object.keys(PHONES) as Name[];
  return names.filter((name) => sent.some((text) => text.includes(digits(PHONES[name])))).sort();
}

function legOf(state: VisibleBoard | undefined, leg: Leg) {
  const found = state?.find((board) => board.leg === leg);
  if (found === undefined) throw new Error(`no ${leg} in the state`);
  return found;
}

describe("readEventState", () => {
  describe("C10.1, C10.3: a number leaves the server only for the device's persons and their car mates", () => {
    it.each<[string, (scene: Awaited<ReturnType<typeof seedScene>>) => string, Name[], Name[]]>([
      ["Léa and Zoé's device", (scene) => scene.lea.token, ["lea", "marc", "zoe"], ["lea", "tom", "zoe"]],
      ["Marc's device", (scene) => scene.marc.token, ["lea", "marc"], ["marc"]],
      ["Tom's device", (scene) => scene.tom.token, ["tom"], ["tom", "zoe"]],
    ])("%s, leg by leg", async (_, tokenOf, aller, retour) => {
      await withRollback(async (trx) => {
        const scene = await seedScene(trx);
        const state = await readEventState(trx, scene.eventId, tokenOf(scene));
        expect(sentNumbers(legOf(state, "aller"))).toEqual(aller);
        // C10.3: Léa rides with Marc at the aller only, so his number is not on her retour.
        expect(sentNumbers(legOf(state, "retour"))).toEqual(retour);
      });
    });
  });

  it("C10.6, C1.6: without a token, the persons are listed, none of the device, and no number is sent", async () => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      const state = await readEventState(trx, scene.eventId);
      expect(sentNumbers(state)).toEqual([]);
      const aller = legOf(state, "aller");
      expect(aller.device).toEqual([]);
      expect(aller.withoutCar).toEqual([{ id: scene.tom.id, firstName: "Tom" }]);
      expect(aller.cars.map((car) => [car.driver.firstName, car.passengers.map((person) => person.firstName)])).toEqual([
        ["Marc", ["Léa"]],
      ]);
      expect(legOf(state, "retour").device).toEqual([]);
    });
  });

  it.each<[string, unknown]>([
    ["C12.3: a well-formed token nobody holds", NOBODYS_TOKEN],
    ["a token one character short", "AAAAAAAAAAAAAAAAAAAAA"],
    ["a token that is not a string", { token: NOBODYS_TOKEN }],
    ["an empty token", ""],
  ])("%s gives a device without a person, and no number", async (_, token) => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      const state = await readEventState(trx, scene.eventId, token);
      expect(state).toEqual(await readEventState(trx, scene.eventId));
      expect(sentNumbers(state)).toEqual([]);
    });
  });

  it("C1.7: the token of event A gives no person on event B", async () => {
    await withRollback(async (trx) => {
      const a = await seedScene(trx);
      const b = await seedScene(trx);
      const state = await readEventState(trx, b.eventId, a.lea.token);
      expect(state?.flatMap((leg) => leg.device)).toEqual([]);
      expect(sentNumbers(state)).toEqual([]);
    });
  });

  it("C2.2: the device's persons and their state on each leg, with their own number", async () => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      const state = await readEventState(trx, scene.eventId, scene.lea.token);
      const lea = { id: scene.lea.id, firstName: "Léa", phone: PHONES.lea };
      const zoe = { id: scene.zoe.id, firstName: "Zoé", phone: PHONES.zoe };
      // Created in the same transaction, both have the same created_at: the order is tested apart.
      const byId = <T extends { id: string }>(persons: T[]) => [...persons].sort((a, b) => a.id.localeCompare(b.id));
      expect(byId(legOf(state, "aller").device)).toEqual(
        byId([
          { ...lea, state: { kind: "passenger", rideId: scene.r1, driver: { id: scene.marc.id, firstName: "Marc" } } },
          { ...zoe, state: { kind: "notConcerned" } },
        ]),
      );
      expect(byId(legOf(state, "retour").device)).toEqual(
        byId([
          { ...lea, state: { kind: "withoutCar" } },
          { ...zoe, state: { kind: "driver", rideId: scene.r2 } },
        ]),
      );
    });
  });

  it("gives the numbers the same device as the board: one set of the device's persons for both", async () => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      await readEventState(trx, scene.eventId, scene.lea.token);
      expect(buildBoard).toHaveBeenCalledTimes(1);
      expect(withVisiblePhones).toHaveBeenCalledTimes(1);
      const boardDevice = vi.mocked(buildBoard).mock.calls[0][2];
      expect(vi.mocked(withVisiblePhones).mock.calls[0][2]).toBe(boardDevice);
      expect(boardDevice).toEqual(new Set([scene.lea.id, scene.zoe.id]));
    });
  });

  it("lists the device's persons in the order they were created, not by id nor by insertion", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const first = await seedPerson(trx, eventId, { firstName: "Léa" });
      const second = await seedPerson(trx, eventId, { firstName: "Zoé" }, first.token);
      const [earlier, later] = [first.id, second.id].sort().reverse();
      // The greater id was created first: id order and creation order disagree.
      await sql`update person set created_at = ${new Date("2026-10-01T08:00:00Z")} where id = ${earlier}`.execute(trx);
      await sql`update person set created_at = ${new Date("2026-10-01T09:00:00Z")} where id = ${later}`.execute(trx);

      const state = await readEventState(trx, eventId, first.token);
      expect(legOf(state, "aller").device.map((person) => person.id)).toEqual([earlier, later]);
    });
  });

  it("has one leg without a retour", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx, { retourAt: null });
      expect((await readEventState(trx, eventId))?.map((leg) => leg.leg)).toEqual(["aller"]);
    });
  });

  it("is plain data, unchanged by serialization", async () => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      const state = await readEventState(trx, scene.eventId, scene.lea.token);
      expect(JSON.parse(JSON.stringify(state))).toStrictEqual(state);
    });
  });

  it("gives nothing for a well-formed id that is not stored", async () => {
    await withRollback(async (trx) => {
      await seedScene(trx);
      expect(await readEventState(trx, "Zz9yXw8v")).toBeUndefined();
    });
  });

  it("refuses to read in a READ COMMITTED transaction, rather than mixing snapshots", async () => {
    await expect(atomically(getDb(), (trx) => readEventState(trx, "Zz9yXw8v"))).rejects.toThrow(
      "onOneSnapshot: the transaction given is in read committed, not repeatable read",
    );
  });

  it("gives nothing for a malformed id, without reading the database", async () => {
    await expect(readEventState(untouchable, "Ab3dEf70", NOBODYS_TOKEN)).resolves.toBeUndefined();
  });

  it("reads everything on one snapshot: a passenger who boards between two reads is not without a car", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const marc = await seedPerson(db, eventId, { firstName: "Marc" });
      const ana = await seedPerson(db, eventId, { firstName: "Ana" });
      const lea = await seedPerson(db, eventId, { firstName: "Léa" });
      const r1 = await seedRide(db, eventId, marc.id, { leg: "aller" });
      await seedPlacement(db, { personId: lea.id, eventId, leg: "aller", rideId: r1 });

      // Once the Rides are read, and before the Placements are: Ana offers a car and Léa
      // moves into it, committed on another connection.
      let moved = false;
      const rideReads = new Set<QueryId>();
      const between: KyselyPlugin = {
        transformQuery({ node, queryId }) {
          const from = node.kind === "SelectQueryNode" ? node.from?.froms[0] : undefined;
          if (from && TableNode.is(from) && from.table.identifier.name === "ride") rideReads.add(queryId);
          return node;
        },
        async transformResult({ queryId, result }) {
          if (rideReads.has(queryId) && !moved) {
            moved = true;
            const r2 = await seedRide(getDb(), eventId, ana.id, { leg: "aller", departureTime: "08:00:00" });
            await seedPlacement(getDb(), { personId: lea.id, eventId, leg: "aller", rideId: r2 });
          }
          return result;
        },
      };

      const aller = legOf(await readEventState(db.withPlugin(between), eventId), "aller");
      expect(moved).toBe(true);
      expect(aller.withoutCar).toEqual([]);
      expect(aller.cars.map((car) => [car.id, car.passengers.map((person) => person.id)])).toEqual([[r1, [lea.id]]]);
    });
  });
});
