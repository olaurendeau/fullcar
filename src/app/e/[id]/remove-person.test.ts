import { randomInt, randomUUID } from "node:crypto";
import { sql, type Kysely, type KyselyPlugin } from "kysely";
import { describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { anonymiseEvent } from "@/db/day-thirty";
import { lockPersons } from "@/db/persons";
import { deletePlacement } from "@/db/placements";
import type { Database } from "@/db/schema";
import { whileHeld, withCommittedEvent } from "@/db/test-committed";
import { withRollback } from "@/db/test-db";
import { seedEvent } from "@/db/test-events";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { seedRemovalExample, type RemovalExample } from "@/db/test-removal-example";
import { coverage } from "@/domain/coverage";
import type { Leg } from "@/domain/leg";
import { removalConfirmation } from "@/domain/person-removal";
import { hashToken } from "@/domain/token-hash";
import { readEventState, type DeviceState, type EventState } from "./event-state";
import { setPersonLeg, updatePerson } from "./persons";
import { removeAsOrganiser, removeFromDevice, type RemovePersonOutcome } from "./remove-person";
import { stillOpen } from "./test-state";

type Db = Kysely<Database>;

/** Well-formed (22 base64url characters, the last one canonical), and held by nobody. */
const NOBODYS_TOKEN = "AAAAAAAAAAAAAAAAAAAAAA";

function legOf(state: DeviceState | undefined, leg: Leg) {
  const found = stillOpen(state)?.legs.find((board) => board.leg === leg);
  if (found === undefined) throw new Error(`no ${leg} in the state`);
  return found;
}

function stateOf(outcome: RemovePersonOutcome): EventState {
  if (!outcome.ok) throw new Error(`refused: ${JSON.stringify(outcome)}`);
  return stillOpen(outcome.state);
}

/** Every row of the event's persons, Rides and Placements, as stored. */
async function rowsOf(db: Db, eventId: string) {
  const persons = await db
    .selectFrom("person")
    .select(["id", "first_name", "phone", "token_hash", "created_at"])
    .where("event_id", "=", eventId)
    .orderBy("id")
    .execute();
  const rides = await db.selectFrom("ride").selectAll().where("event_id", "=", eventId).orderBy("id").execute();
  const placements = await db
    .selectFrom("placement")
    .selectAll()
    .where("event_id", "=", eventId)
    .orderBy("person_id")
    .orderBy("leg")
    .execute();
  return { persons, rides, placements };
}

function seedExample(db: Db): Promise<RemovalExample> {
  return seedRemovalExample(db);
}

describe("removeFromDevice: what is erased (RP2)", () => {
  it("RP2.1: Marc removed, his car goes, his passengers are without a car at the aller only", async () => {
    await withRollback(async (trx) => {
      const { eventId, martins, persons, rides } = await seedExample(trx);
      const { lea, ines, hugo, marc } = persons;
      const before = await rowsOf(trx, eventId);

      const outcome = await removeFromDevice(trx, eventId, martins, { personId: marc.id });
      expect(outcome).toMatchObject({ ok: true, removal: "removed" });

      const after = await rowsOf(trx, eventId);
      expect(after.persons.map((row) => row.id)).not.toContain(marc.id);
      expect(after.rides.filter((row) => row.driver_id === marc.id)).toEqual([]);
      const of = (rows: typeof after.placements, leg: Leg) =>
        rows.filter((row) => row.leg === leg && [lea.id, ines.id, hugo.id].includes(row.person_id));
      expect(of(after.placements, "aller").map((row) => row.ride_id)).toEqual([null, null, null]);
      expect(of(after.placements, "retour")).toEqual(of(before.placements, "retour"));

      const state = stateOf(outcome);
      expect(state).toEqual(await readEventState(trx, eventId, martins));
      const sophies = legOf(state, "retour").cars.find((car) => car.id === rides.sophieRetour);
      expect(sophies?.freeSeats).toBe(3);
      expect(coverage(legOf(state, "aller"))).toEqual({ withoutCar: 5, freeSeats: 1 });
      expect(coverage(legOf(state, "retour"))).toEqual({ withoutCar: 3, freeSeats: 5 });
    });
  });

  it("RP2.2: Hugo, on the aller only, leaves every row of the retour as it was, placed_at included", async () => {
    await withRollback(async (trx) => {
      const { eventId, persons } = await seedExample(trx);
      const retour = async () => {
        const { rides, placements } = await rowsOf(trx, eventId);
        return { rides: rides.filter((row) => row.leg === "retour"), placements: placements.filter((row) => row.leg === "retour") };
      };
      const before = await retour();
      stateOf(await removeFromDevice(trx, eventId, persons.hugo.token, { personId: persons.hugo.id }));
      expect(await retour()).toEqual(before);
    });
  });

  it("RP2.3: the duplicate, without a car on both legs: one fewer without a car, the same free seats", async () => {
    await withRollback(async (trx) => {
      const { eventId, persons } = await seedExample(trx);
      const { doublon } = persons;
      const before = await readEventState(trx, eventId);
      expect(coverage(legOf(before, "aller"))).toEqual({ withoutCar: 2, freeSeats: 1 });
      expect(coverage(legOf(before, "retour"))).toEqual({ withoutCar: 3, freeSeats: 4 });

      const state = stateOf(await removeFromDevice(trx, eventId, doublon.token, { personId: doublon.id }));
      expect(coverage(legOf(state, "aller"))).toEqual({ withoutCar: 1, freeSeats: 1 });
      expect(coverage(legOf(state, "retour"))).toEqual({ withoutCar: 2, freeSeats: 4 });
    });
  });

  it("RP2.4: a person on no leg is removed, and no other row changes", async () => {
    await withRollback(async (trx) => {
      const { eventId } = await seedExample(trx);
      const idle = await seedPerson(trx, eventId, { firstName: "Paul" });
      const before = await rowsOf(trx, eventId);
      stateOf(await removeFromDevice(trx, eventId, idle.token, { personId: idle.id }));
      expect(await rowsOf(trx, eventId)).toEqual({
        ...before,
        persons: before.persons.filter((row) => row.id !== idle.id),
      });
    });
  });

  it("RP2.5: the other persons of the token stay, and stay changeable with it", async () => {
    await withRollback(async (trx) => {
      const { eventId, martins, persons } = await seedExample(trx);
      const { lea, tom, marc } = persons;
      const state = stateOf(await removeFromDevice(trx, eventId, martins, { personId: marc.id }));
      // Created in one transaction, they share a creation time: their order is their ids'.
      expect(legOf(state, "aller").device.map((person) => person.id).sort()).toEqual([lea.id, tom.id].sort());
      expect(await updatePerson(trx, eventId, martins, { personId: lea.id, firstName: "Léna" })).toMatchObject({ ok: true });
      const changed = await setPersonLeg(trx, eventId, martins, { personId: tom.id, leg: "retour", kind: "withoutCar" });
      expect(changed).toMatchObject({ ok: true });
    });
  });

  it("RP2.6: removed again, or the same request sent again, the answer is alreadyRemoved and nothing is written", async () => {
    await withRollback(async (trx) => {
      const { eventId, martins, persons } = await seedExample(trx);
      const sent = { personId: persons.tom.id };
      stateOf(await removeFromDevice(trx, eventId, martins, sent));
      const before = await rowsOf(trx, eventId);
      const again = await removeFromDevice(trx, eventId, martins, sent);
      expect(again).toEqual({ ok: true, removal: "alreadyRemoved", state: await readEventState(trx, eventId, martins) });
      expect(await rowsOf(trx, eventId)).toEqual(before);
    });
  });

  it("RP2.7: all or nothing, an error after the Rides are deleted leaves every row as it was", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const marc = await seedPerson(db, eventId, { firstName: "Marc" });
      const lea = await seedPerson(db, eventId, { firstName: "Léa" });
      const ride = await seedRide(db, eventId, marc.id, { leg: "aller" });
      await seedPlacement(db, { personId: lea.id, eventId, leg: "aller", rideId: ride });
      await seedPlacement(db, { personId: marc.id, eventId, leg: "retour", rideId: null });
      const before = await rowsOf(db, eventId);

      let ridesDeleted = 0;
      const failAfterRides: KyselyPlugin = {
        transformQuery({ node }) {
          if (node.kind !== "DeleteQueryNode") return node;
          const table = JSON.stringify(node.from);
          if (table.includes('"ride"')) ridesDeleted++;
          else if (ridesDeleted > 0) throw new Error("injected after the Rides");
          return node;
        },
        transformResult: async ({ result }) => result,
      };
      await expect(
        removeFromDevice(getDb().withPlugin(failAfterRides), eventId, marc.token, { personId: marc.id }),
      ).rejects.toThrow("injected after the Rides");
      expect(ridesDeleted).toBe(1);
      expect(await rowsOf(db, eventId)).toEqual(before);
    });
  });

  it("restarts, never fails, when a car of the person is committed between the read of her Rides and the lock of her Person", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const tom = await seedPerson(db, eventId, { firstName: "Tom" });
      await seedPlacement(db, { personId: tom.id, eventId, leg: "aller", rideId: null });
      // The offer holds Tom's Person, as offerRide does before it inserts his car.
      const outcome = await whileHeld(
        db,
        async (offer) => {
          await lockPersons(offer, eventId, [tom.id]);
          await deletePlacement(offer, { personId: tom.id, eventId, leg: "aller" });
          await seedRide(offer, eventId, tom.id, { leg: "aller" });
        },
        (own) => removeFromDevice(own, eventId, tom.token, { personId: tom.id }),
      );
      expect(outcome).toMatchObject({ ok: true, removal: "removed" });
      expect(await rowsOf(db, eventId)).toEqual({ persons: [], rides: [], placements: [] });
    });
  });
});

describe("removeFromDevice: privacy (RP6.1)", () => {
  it("RP6.1: no column of any table holds her first name, her number or her id; her hash stays only on her device's others", async () => {
    await withRollback(async (trx) => {
      const { eventId, martins, persons, rides } = await seedExample(trx);
      const firstName = `Zoé${randomUUID().slice(0, 8)}`;
      const phone = `06 ${randomInt(10_000_000, 100_000_000)}`;
      const zoe = await seedPerson(trx, eventId, { firstName, phone }, martins);
      await seedPlacement(trx, { personId: zoe.id, eventId, leg: "aller", rideId: rides.claireAller });
      const hash = hashToken(martins);

      const { rows: tables } = await sql<{ name: string }>`
        select table_name as name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'`.execute(trx);
      const holding = async (needle: string) => {
        const found: string[] = [];
        for (const { name } of tables) {
          const { rows } = await sql<{ n: number }>`
            select count(*)::int as n from ${sql.table(name)} as t where t::text like ${`%${needle}%`}`.execute(trx);
          if (rows[0].n > 0) found.push(name);
        }
        return found;
      };
      expect(await holding(firstName)).toEqual(["person"]);

      stateOf(await removeFromDevice(trx, eventId, martins, { personId: zoe.id }));
      expect(await holding(firstName)).toEqual([]);
      expect(await holding(phone)).toEqual([]);
      expect(await holding(zoe.id)).toEqual([]);
      const hashed = await trx
        .selectFrom("person")
        .select("id")
        .where("token_hash", "=", Buffer.from(hash, "hex"))
        .orderBy("id")
        .execute();
      expect(hashed.map((row) => row.id)).toEqual([persons.marc.id, persons.lea.id, persons.tom.id].sort());
    });
  });
});

// #806, OA8.3: the place stays in the row of an anonymised event, and may be someone's address.
describe("an anonymised event (#806)", () => {
  it.each<[string, (db: Db, example: RemovalExample) => Promise<RemovePersonOutcome>]>([
    ["removeFromDevice", (db, { eventId, martins, persons }) => removeFromDevice(db, eventId, martins, { personId: persons.marc.id })],
    [
      "removeAsOrganiser",
      (db, { eventId, adminToken, martins, persons }) => removeAsOrganiser(db, eventId, { adminToken }, martins, { personId: persons.marc.id }),
    ],
  ])("OA8.3: %s answers the event ended at most, neither its place nor anyone", async (_, remove) => {
    await withRollback(async (trx) => {
      const example = await seedExample(trx);
      await anonymiseEvent(trx, example.eventId);
      const outcome = await remove(trx, example);
      expect(JSON.stringify(outcome)).not.toContain("Gymnase des Gayeulles");
      if ("state" in outcome) {
        expect(outcome.state).toStrictEqual({ ended: true, title: "Tournoi de Rennes", allerAt: "2026-12-12 07:30:00" });
      }
    });
  });
});

describe("removeFromDevice: who may remove whom (RP3)", () => {
  it("RP3.1: only a person created with the token; anyone else is forbidden, nothing is written, nothing of her is answered", async () => {
    await withRollback(async (trx) => {
      const { eventId, martins, persons } = await seedExample(trx);
      const before = await rowsOf(trx, eventId);
      for (const other of [persons.claire, persons.doublon]) {
        const refused = await removeFromDevice(trx, eventId, martins, { personId: other.id });
        expect(refused).toEqual({ ok: false, error: "forbidden" });
      }
      expect(await rowsOf(trx, eventId)).toEqual(before);
      stateOf(await removeFromDevice(trx, eventId, persons.claire.token, { personId: persons.claire.id }));
    });
  });

  it("RP3.4: invalid, then eventNotFound, then the token, then an unknown person, then another token's", async () => {
    await withRollback(async (trx) => {
      const { eventId, martins, persons } = await seedExample(trx);
      const before = await rowsOf(trx, eventId);
      const unknown = { personId: randomUUID() };
      const answers = {
        malformedOnUnknownEvent: await removeFromDevice(trx, "zzzzzzzz", "bad", { personId: "nope" }),
        notAnObject: await removeFromDevice(trx, eventId, martins, "nope"),
        unknownEvent: await removeFromDevice(trx, "zzzzzzzz", "bad", unknown),
        malformedEventId: await removeFromDevice(trx, "nope", martins, unknown),
        unknownWithoutToken: await removeFromDevice(trx, eventId, undefined, unknown),
        unknownWithMalformedToken: await removeFromDevice(trx, eventId, "short", unknown),
        knownWithoutToken: await removeFromDevice(trx, eventId, undefined, { personId: persons.marc.id }),
        unknownWithToken: await removeFromDevice(trx, eventId, NOBODYS_TOKEN, unknown),
        anotherTokens: await removeFromDevice(trx, eventId, NOBODYS_TOKEN, { personId: persons.marc.id }),
      };
      expect(answers).toMatchObject({
        malformedOnUnknownEvent: { ok: false, error: "invalid" },
        notAnObject: { ok: false, error: "invalid" },
        unknownEvent: { ok: false, error: "eventNotFound" },
        malformedEventId: { ok: false, error: "eventNotFound" },
        unknownWithoutToken: { ok: false, error: "forbidden" },
        unknownWithMalformedToken: { ok: false, error: "forbidden" },
        knownWithoutToken: { ok: false, error: "forbidden" },
        unknownWithToken: { ok: true, removal: "alreadyRemoved" },
        anotherTokens: { ok: false, error: "forbidden" },
      });
      expect(await rowsOf(trx, eventId)).toEqual(before);
    });
  });

  it("RP3.3: the admin token is no personal token: it removes nobody from the device path", async () => {
    await withRollback(async (trx) => {
      const { eventId, adminToken, persons } = await seedExample(trx);
      expect(await removeFromDevice(trx, eventId, adminToken, { personId: persons.marc.id })).toEqual({
        ok: false,
        error: "forbidden",
      });
    });
  });
});

describe("removeAsOrganiser (RP3.2: organiser-access.ts, here by the creation browser's token)", () => {
  it("RP3.2: the admin token removes anyone, and the answer is the board of the device token sent", async () => {
    await withRollback(async (trx) => {
      const { eventId, adminToken, martins, persons } = await seedExample(trx);
      const outcome = await removeAsOrganiser(trx, eventId, { adminToken }, martins, { personId: persons.doublon.id });
      expect(outcome).toEqual({ ok: true, removal: "removed", state: await readEventState(trx, eventId, martins) });
      expect(coverage(legOf(stateOf(outcome), "aller"))).toEqual({ withoutCar: 1, freeSeats: 1 });
      expect(coverage(legOf(stateOf(outcome), "retour"))).toEqual({ withoutCar: 2, freeSeats: 4 });
      const again = await removeAsOrganiser(trx, eventId, { adminToken }, undefined, { personId: persons.doublon.id });
      expect(again).toMatchObject({ ok: true, removal: "alreadyRemoved" });
    });
  });

  it("RP3.2: a wrong, absent or revoked admin token is noOrganiserAccess, and nothing is written", async () => {
    await withRollback(async (trx) => {
      const { eventId, adminToken, persons } = await seedExample(trx);
      const { id: otherEventId, token: othersAdmin } = await seedEvent(trx);
      expect(otherEventId).not.toBe(eventId);
      const before = await rowsOf(trx, eventId);
      const sent = { personId: persons.marc.id };
      for (const token of [othersAdmin, undefined, 42, NOBODYS_TOKEN]) {
        expect(await removeAsOrganiser(trx, eventId, { adminToken: token }, undefined, sent)).toEqual({ ok: false, error: "noOrganiserAccess" });
      }
      await trx.updateTable("event").set({ admin_token_hash: null }).where("id", "=", eventId).execute();
      expect(await removeAsOrganiser(trx, eventId, { adminToken }, undefined, sent)).toEqual({
        ok: false,
        error: "noOrganiserAccess",
      });
      expect(await rowsOf(trx, eventId)).toEqual(before);
    });
  });

  it("RP3.3: no personal token opens the organiser path, not even one of the creation browser's", async () => {
    await withRollback(async (trx) => {
      const { eventId, martins, persons } = await seedExample(trx);
      const before = await rowsOf(trx, eventId);
      for (const token of [martins, persons.marc.token, persons.doublon.token]) {
        const refused = await removeAsOrganiser(trx, eventId, { adminToken: token }, martins, { personId: persons.marc.id });
        expect(refused).toEqual({ ok: false, error: "noOrganiserAccess" });
      }
      expect(await rowsOf(trx, eventId)).toEqual(before);
    });
  });

  it("RP3.4: invalid, then eventNotFound, then noOrganiserAccess whether the id is known or not", async () => {
    await withRollback(async (trx) => {
      const { eventId, adminToken, persons } = await seedExample(trx);
      const unknown = { personId: randomUUID() };
      const answers = {
        malformedOnUnknownEvent: await removeAsOrganiser(trx, "zzzzzzzz", { adminToken: "bad" }, undefined, { personId: 7 }),
        unknownEvent: await removeAsOrganiser(trx, "zzzzzzzz", { adminToken: "bad" }, undefined, unknown),
        knownWithoutAccess: await removeAsOrganiser(trx, eventId, { adminToken: "bad" }, undefined, { personId: persons.marc.id }),
        unknownWithoutAccess: await removeAsOrganiser(trx, eventId, { adminToken: "bad" }, undefined, unknown),
        unknownWithAccess: await removeAsOrganiser(trx, eventId, { adminToken }, undefined, unknown),
      };
      expect(answers).toMatchObject({
        malformedOnUnknownEvent: { ok: false, error: "invalid" },
        unknownEvent: { ok: false, error: "eventNotFound" },
        knownWithoutAccess: { ok: false, error: "noOrganiserAccess" },
        unknownWithoutAccess: { ok: false, error: "noOrganiserAccess" },
        unknownWithAccess: { ok: true, removal: "alreadyRemoved" },
      });
    });
  });
});

describe("the confirmation counted on the state the page shows (RP1.2, RP4.5)", () => {
  it("gives the lines of the mock-ups for Marc, Léa, Tom and the duplicate, from the board and the organiser's", async () => {
    await withRollback(async (trx) => {
      const { eventId, martins, persons } = await seedExample(trx);
      const board = stillOpen(await readEventState(trx, eventId, martins))?.legs ?? [];
      expect(removalConfirmation(board, persons.marc.id)).toEqual({
        lines: [
          { key: "drives", leg: "aller", passengers: 3 },
          { key: "passenger", leg: "retour", driver: "Sophie" },
        ],
        cars: 2,
      });
      expect(removalConfirmation(board, persons.lea.id)).toEqual({
        lines: [{ key: "passenger", leg: "aller", driver: "Marc" }],
        cars: 1,
      });
      expect(removalConfirmation(board, persons.tom.id)).toEqual({ lines: [], cars: 0 });
      expect(removalConfirmation(board, persons.doublon.id)).toEqual({ lines: [], cars: 0 });
    });
  });
});
