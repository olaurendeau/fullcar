import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { insertPerson, lockPersons, readTokenHolders, updatePerson } from "./persons";
import type { Database } from "./schema";
import { withCommittedEvent } from "./test-committed";
import { withRollback } from "./test-db";
import { seedEvent } from "./test-events";
import { seedPerson } from "./test-participants";
import { atomically } from "./transaction";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

async function personsOf(trx: Kysely<Database>, eventId: string) {
  return trx
    .selectFrom("person")
    .select(["id", "first_name", "phone", "token_hash"])
    .where("event_id", "=", eventId)
    .orderBy("id")
    .execute();
}

describe("insertPerson", () => {
  it("stores the person, its hash as bytes, and returns it", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const id = randomUUID();
      const stored = await insertPerson(trx, { id, eventId, firstName: "Léa", phone: "06 12 34 56 78", tokenHash: HASH_A });
      expect(stored).toEqual({ id, eventId, firstName: "Léa", tokenHash: HASH_A });
      expect(await personsOf(trx, eventId)).toEqual([
        { id, first_name: "Léa", phone: "06 12 34 56 78", token_hash: Buffer.from(HASH_A, "hex") },
      ]);
    });
  });

  it("inserts the same id once, and returns the row already stored", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const id = randomUUID();
      const first = await insertPerson(trx, { id, eventId, firstName: "Léa", phone: null, tokenHash: HASH_A });
      const again = await insertPerson(trx, { id, eventId, firstName: "Paul", phone: "0612345678", tokenHash: HASH_B });
      expect(again).toEqual(first);
      expect(await personsOf(trx, eventId)).toEqual([
        { id, first_name: "Léa", phone: null, token_hash: Buffer.from(HASH_A, "hex") },
      ]);
    });
  });

  it("returns nothing of the other event holding the id, and writes nothing", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const { id: otherId } = await seedEvent(trx);
      const id = randomUUID();
      await insertPerson(trx, { id, eventId, firstName: "Léa", phone: null, tokenHash: HASH_A });
      const again = await insertPerson(trx, { id, eventId: otherId, firstName: "Paul", phone: null, tokenHash: HASH_B });
      expect(again).toBeUndefined();
      expect(await personsOf(trx, otherId)).toEqual([]);
      expect(await personsOf(trx, eventId)).toEqual([
        { id, first_name: "Léa", phone: null, token_hash: Buffer.from(HASH_A, "hex") },
      ]);
    });
  });
});

describe("updatePerson", () => {
  it("changes the first name and the phone of the person of that event", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const id = randomUUID();
      await insertPerson(trx, { id, eventId, firstName: "Léa", phone: "0612345678", tokenHash: HASH_A });
      expect(await updatePerson(trx, { id, eventId }, { firstName: "Léna", phone: null })).toBe(true);
      expect(await personsOf(trx, eventId)).toEqual([
        { id, first_name: "Léna", phone: null, token_hash: Buffer.from(HASH_A, "hex") },
      ]);
    });
  });

  it("changes nothing for an id of another event", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const { id: otherId } = await seedEvent(trx);
      const id = randomUUID();
      await insertPerson(trx, { id, eventId, firstName: "Léa", phone: null, tokenHash: HASH_A });
      expect(await updatePerson(trx, { id, eventId: otherId }, { firstName: "Léna", phone: null })).toBe(false);
      expect((await personsOf(trx, eventId))[0].first_name).toBe("Léa");
    });
  });
});

describe("readTokenHolders", () => {
  it("lists the persons of the event only, with their hash in hex", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const { id: otherId } = await seedEvent(trx);
      const lea = randomUUID();
      const paul = randomUUID();
      await insertPerson(trx, { id: lea, eventId, firstName: "Léa", phone: null, tokenHash: HASH_A });
      await insertPerson(trx, { id: paul, eventId, firstName: "Paul", phone: null, tokenHash: HASH_B });
      await insertPerson(trx, { id: randomUUID(), eventId: otherId, firstName: "Zoé", phone: null, tokenHash: HASH_A });
      const holders = await readTokenHolders(trx, eventId);
      expect(holders).toHaveLength(2);
      expect(holders).toEqual(
        expect.arrayContaining([
          { id: lea, tokenHash: HASH_A },
          { id: paul, tokenHash: HASH_B },
        ]),
      );
    });
  });

  it("lists nobody for an unknown event", async () => {
    expect(await withRollback((trx) => readTokenHolders(trx, "zzzzzzzz"))).toEqual([]);
  });
});

describe("lockPersons", () => {
  it("returns those of the ids that are persons of the event, in id order", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const { id: otherEventId } = await seedEvent(trx);
      const ids = [(await seedPerson(trx, eventId)).id, (await seedPerson(trx, eventId)).id];
      const stranger = (await seedPerson(trx, otherEventId)).id;
      expect(await lockPersons(trx, eventId, [...ids].reverse().concat(stranger, randomUUID()))).toEqual(ids.sort());
      expect(await lockPersons(trx, eventId, [])).toEqual([]);
    });
  });

  it("holds the lock until the transaction ends", async () => {
    await withCommittedEvent(async (db, eventId) => {
      const { id } = await seedPerson(db, eventId);
      const forUpdate = () => sql`select id from person where id = ${id} for update nowait`.execute(db);
      await atomically(db, async (trx) => {
        await lockPersons(trx, eventId, [id]);
        await expect(forUpdate()).rejects.toMatchObject({ code: "55P03" });
      });
      await expect(forUpdate()).resolves.toBeDefined();
    });
  });
});
