import type { Transaction } from "kysely";
import { describe, expect, it } from "vitest";
import { adminTokenMatches, hashAdminToken } from "@/domain/admin-token";
import { LOCATION_MAX, TITLE_MAX, type NewEvent } from "@/domain/event";
import { PUBLIC_ID_ALPHABET, isPublicId } from "@/domain/public-id";
import { INSERT_ATTEMPTS, insertEvent, readAdminTokenHash } from "./events";
import type { Database } from "./schema";
import { withRollback } from "./test-db";
import { seedEvent } from "./test-events";

const HASH = hashAdminToken("not a real token");

const event: NewEvent = {
  title: "Tournoi de Rennes",
  location: "Gymnase des Gayeulles",
  allerAt: "2026-12-12 07:30:00",
  retourAt: "2026-12-12 18:00:00",
  boostersEnabled: true,
  participationEnabled: false,
  stopsEnabled: true,
};

/** A generator handing out `ids` in order, and counting its calls. */
function idsInOrder(...ids: string[]) {
  const generator = Object.assign(() => ids[Math.min(generator.calls++, ids.length - 1)], { calls: 0 });
  return generator;
}

function count(trx: Transaction<Database>) {
  return trx
    .selectFrom("event")
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .executeTakeFirstOrThrow()
    .then((row) => Number(row.n));
}

describe("insertEvent", () => {
  it("stores the event under a new public id, with the hash as 32 bytes", async () => {
    const { id, row } = await withRollback(async (trx) => {
      const id = await insertEvent(trx, event, HASH);
      const row = await trx.selectFrom("event").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
      return { id, row };
    });
    expect(isPublicId(id)).toBe(true);
    expect(row).toMatchObject({
      id,
      title: "Tournoi de Rennes",
      location: "Gymnase des Gayeulles",
      aller_at: "2026-12-12 07:30:00",
      retour_at: "2026-12-12 18:00:00",
      boosters_enabled: true,
      participation_enabled: false,
      stops_enabled: true,
    });
    expect(row.admin_token_hash).toEqual(Buffer.from(HASH, "hex"));
  });

  it("stores an event without retour", async () => {
    const row = await withRollback(async (trx) => {
      const id = await insertEvent(trx, { ...event, retourAt: null }, HASH);
      return trx.selectFrom("event").select("retour_at").where("id", "=", id).executeTakeFirstOrThrow();
    });
    expect(row.retour_at).toBeNull();
  });

  it("C8.2: draws a new id when the first one is taken, without an error", async () => {
    const { first, second, generator } = await withRollback(async (trx) => {
      const first = await insertEvent(trx, event, HASH, () => "Ab3dEf7h");
      const generator = idsInOrder("Ab3dEf7h", "Zz9yXw8v");
      const second = await insertEvent(trx, { ...event, title: "Autre" }, HASH, generator);
      return { first, second, generator };
    });
    expect(first).toBe("Ab3dEf7h");
    expect(second).toBe("Zz9yXw8v");
    expect(generator.calls).toBe(2);
  });

  it("C8.2: keeps the event already under the id", async () => {
    const titles = await withRollback(async (trx) => {
      await insertEvent(trx, event, HASH, () => "Ab3dEf7h");
      await insertEvent(trx, { ...event, title: "Autre" }, HASH, idsInOrder("Ab3dEf7h", "Zz9yXw8v"));
      return trx.selectFrom("event").select(["id", "title"]).orderBy("id").execute();
    });
    expect(titles).toEqual([
      { id: "Ab3dEf7h", title: "Tournoi de Rennes" },
      { id: "Zz9yXw8v", title: "Autre" },
    ]);
  });

  it(`gives up after ${INSERT_ATTEMPTS} taken ids, storing nothing more`, async () => {
    const generator = idsInOrder("Ab3dEf7h");
    const stored = await withRollback(async (trx) => {
      await insertEvent(trx, event, HASH, () => "Ab3dEf7h");
      const before = await count(trx);
      await expect(insertEvent(trx, event, HASH, generator)).rejects.toThrow("no free id");
      return (await count(trx)) - before;
    });
    expect(INSERT_ATTEMPTS).toBeGreaterThan(1);
    expect(INSERT_ATTEMPTS).toBeLessThanOrEqual(10);
    expect(generator.calls).toBe(INSERT_ATTEMPTS);
    expect(stored).toBe(0);
  });

  // The migration writes its own regex: every symbol the domain draws must pass it.
  it("stores ids that, together, use every symbol of the domain's alphabet", async () => {
    const symbols = PUBLIC_ID_ALPHABET.padEnd(Math.ceil(PUBLIC_ID_ALPHABET.length / 8) * 8, "2");
    const ids = symbols.match(/.{8}/g) ?? [];
    expect(new Set(ids.join(""))).toEqual(new Set(PUBLIC_ID_ALPHABET));
    const stored = await withRollback(async (trx) => {
      for (const id of ids) await insertEvent(trx, event, HASH, () => id);
      return trx.selectFrom("event").select("id").where("id", "in", ids).execute();
    });
    expect(stored.map((row) => row.id).sort()).toEqual([...ids].sort());
  });

  // The migration writes its own limits: if the domain raises them without one, this breaks.
  it("stores a title and a location of exactly the domain's maximum length", async () => {
    const title = "🚗".repeat(TITLE_MAX);
    const location = "🚌".repeat(LOCATION_MAX);
    const row = await withRollback(async (trx) => {
      const id = await insertEvent(trx, { ...event, title, location }, HASH);
      return trx.selectFrom("event").select(["title", "location"]).where("id", "=", id).executeTakeFirstOrThrow();
    });
    expect(row).toEqual({ title, location });
  });
});

describe("readAdminTokenHash", () => {
  it("gives back the stored hash in lowercase hex", async () => {
    const hash = await withRollback(async (trx) => {
      const id = await insertEvent(trx, event, HASH);
      return readAdminTokenHash(trx, id);
    });
    expect(hash).toBe(HASH);
  });

  it("gives nothing for an unknown id, or a known one in another case", async () => {
    const hashes = await withRollback(async (trx) => {
      await insertEvent(trx, event, HASH, () => "Ab3dEf7h");
      return [await readAdminTokenHash(trx, "Zz9yXw8v"), await readAdminTokenHash(trx, "ab3dEf7h")];
    });
    expect(hashes).toEqual([undefined, undefined]);
  });
});

describe("seedEvent", () => {
  it("stores an event and hands back its id and the token matching its hash", async () => {
    const { seeded, hash } = await withRollback(async (trx) => {
      const seeded = await seedEvent(trx);
      return { seeded, hash: await readAdminTokenHash(trx, seeded.id) };
    });
    expect(isPublicId(seeded.id)).toBe(true);
    expect(adminTokenMatches(seeded.token, hash)).toBe(true);
  });

  it("takes the fields to change", async () => {
    const row = await withRollback(async (trx) => {
      const { id } = await seedEvent(trx, { title: "Mariage", retourAt: null, stopsEnabled: true });
      return trx.selectFrom("event").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
    });
    expect(row).toMatchObject({ title: "Mariage", retour_at: null, stops_enabled: true });
  });
});
