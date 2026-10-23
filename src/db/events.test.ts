import { sql, type Kysely, type Transaction } from "kysely";
import { describe, expect, it } from "vitest";
import { adminTokenMatches, hashAdminToken } from "@/domain/admin-token";
import { LOCATION_MAX, TITLE_MAX, type NewEvent } from "@/domain/event";
import { PUBLIC_ID_ALPHABET, isPublicId } from "@/domain/public-id";
import { INSERT_ATTEMPTS, findEventById, insertEvent, lockEvent, readAdminTokenHash, writeEventFields } from "./events";
import type { Database } from "./schema";
import { withCommittedEvent } from "./test-committed";
import { withRollback } from "./test-db";
import { seedEvent } from "./test-events";

const HASH = hashAdminToken("not a real token");

const LYON = { lat: 45.7581, lng: 4.6894 };

const event: NewEvent = {
  title: "Tournoi de Rennes",
  location: "Gymnase des Gayeulles",
  allerAt: "2026-12-12 07:30:00",
  retourAt: "2026-12-12 18:00:00",
  locationPosition: null,
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
      location_lat: null,
      location_lng: null,
      boosters_enabled: true,
      participation_enabled: false,
      stops_enabled: true,
    });
    expect(row.admin_token_hash).toEqual(Buffer.from(HASH, "hex"));
  });

  it("AL1.7, AL2.1: stores the position of the location", async () => {
    const row = await withRollback(async (trx) => {
      const id = await insertEvent(trx, { ...event, locationPosition: { lat: 45.75813, lng: 4.68944 } }, HASH);
      return trx.selectFrom("event").select(["location_lat", "location_lng"]).where("id", "=", id).executeTakeFirstOrThrow();
    });
    expect(row).toEqual({ location_lat: 45.75813, location_lng: 4.68944 });
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
      return trx
        .selectFrom("event")
        .select(["id", "title"])
        .where("id", "in", ["Ab3dEf7h", "Zz9yXw8v"])
        .orderBy("id")
        .execute();
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

describe("writeEventFields", () => {
  it("writes the title, the place, the start and the end, and nothing else", async () => {
    await withRollback(async (trx) => {
      const { id } = await seedEvent(trx, { boostersEnabled: true });
      const hash = await readAdminTokenHash(trx, id);
      const fields = { title: "Finale", location: "Stade", allerAt: "2026-12-13 14:00:00", retourAt: null };

      expect(await writeEventFields(trx, id, fields)).toBe(true);

      expect(await findEventById(trx, id)).toEqual({
        id,
        title: "Finale",
        location: "Stade",
        aller_at: "2026-12-13 14:00:00",
        retour_at: null,
        location_lat: null,
        location_lng: null,
        boosters_enabled: true,
        participation_enabled: false,
        stops_enabled: false,
      });
      expect(await readAdminTokenHash(trx, id)).toBe(hash);
    });
  });

  it("AL5.2: writes the position sent with the place, null included", async () => {
    await withRollback(async (trx) => {
      const { id } = await seedEvent(trx);
      const fields = { title: "Finale", location: "Stade", allerAt: "2026-12-13 14:00:00", retourAt: null };

      await writeEventFields(trx, id, { ...fields, locationPosition: { lat: 48.1173, lng: -1.67779 } });
      expect(await findEventById(trx, id)).toMatchObject({ location_lat: 48.1173, location_lng: -1.67779 });

      await writeEventFields(trx, id, { ...fields, locationPosition: null });
      expect(await findEventById(trx, id)).toMatchObject({ location_lat: null, location_lng: null });
    });
  });

  it("AL5.6: keeps the position stored when none is sent, the place changed", async () => {
    await withRollback(async (trx) => {
      const { id } = await seedEvent(trx, { locationPosition: LYON });
      const fields = { title: "Finale", location: "Stade", allerAt: "2026-12-13 14:00:00", retourAt: null };

      expect(await writeEventFields(trx, id, fields)).toBe(true);
      expect(await findEventById(trx, id)).toMatchObject({ location: "Stade", location_lat: LYON.lat, location_lng: LYON.lng });
    });
  });

  it("writes nothing for an unknown id", async () => {
    await withRollback(async (trx) => {
      const fields = { title: "Finale", location: "Stade", allerAt: "2026-12-13 14:00:00", retourAt: null };
      expect(await writeEventFields(trx, "Zz9yXw8v", fields)).toBe(false);
    });
  });
});

describe("lockEvent", () => {
  it("gives the event's public fields, and nothing for an unknown id", async () => {
    await withRollback(async (trx) => {
      const { id } = await seedEvent(trx);
      expect(await lockEvent(trx, id, "share")).toEqual(await findEventById(trx, id));
      expect(await lockEvent(trx, id, "noKeyUpdate")).toEqual(await findEventById(trx, id));
      expect(await lockEvent(trx, "Zz9yXw8v", "share")).toBeUndefined();
    });
  });

  /** Whether `lock`, taken on the connection, waits for a transaction that holds `held`. */
  async function waits(db: Kysely<Database>, id: string, held: "share" | "noKeyUpdate", lock: "share" | "noKeyUpdate") {
    const holder = await db.startTransaction().execute();
    try {
      await lockEvent(holder, id, held);
      const other = await db.startTransaction().execute();
      try {
        await sql`set local lock_timeout = '200ms'`.execute(other);
        return await lockEvent(other, id, lock).then(
          () => false,
          (error: { code?: string }) => {
            if (error.code === "55P03") return true;
            throw error;
          },
        );
      } finally {
        await other.rollback().execute();
      }
    } finally {
      await holder.rollback().execute();
    }
  }

  // Writes on the legs share the Event, and are not queued behind each other; a change of
  // the event waits for them, and they wait for it (M3.6).
  it("share does not wait for share; noKeyUpdate and share wait for each other", async () => {
    await withCommittedEvent(async (db, id) => {
      expect(await waits(db, id, "share", "share")).toBe(false);
      expect(await waits(db, id, "share", "noKeyUpdate")).toBe(true);
      expect(await waits(db, id, "noKeyUpdate", "share")).toBe(true);
    });
  });
});
