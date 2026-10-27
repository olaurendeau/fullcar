import { randomBytes } from "node:crypto";
import { sql, type Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { readAdminTokenHash } from "@/db/events";
import type { Database } from "@/db/schema";
import { withRollback } from "@/db/test-db";
import { confirmSeededEvent, seedEvent } from "@/db/test-events";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { findPublicEvent } from "@/app/e/[id]/event";
import { purgeDayThirty } from "./day-thirty";

type Db = Kysely<Database>;

// Last legs long past, which no other test seeds: a purge run here takes nothing but the
// events of this file, even those another file commits at the same time.
const ALLER = "1999-03-14 07:30:00";
const RETOUR = "1999-03-14 18:00:00";
// Day 30 of 1999-03-14 is 1999-04-13, which begins at 1999-04-12T22:00:00Z (summer time).
const DAY_TWENTY_NINE = new Date("1999-04-12T21:59:59Z");
const DAY_THIRTY = new Date("1999-04-12T22:00:00Z");

const MARKER = "Zorglub4729";
const FIRST_NAME = "Ysaline8812";
const PHONE = "06 98 76 54 32";

/**
 * An event on the dates above, with a position, the marker in its description, Ysaline
 * (with a number) driving Marc on both legs, and a confirmation link.
 */
async function seedFullEvent(db: Db) {
  const { id, token } = await seedEvent(db, {
    allerAt: ALLER,
    retourAt: RETOUR,
    locationPosition: { lat: 48.1, lng: -1.6 },
    description: `Appeler ${MARKER} au portail`,
    boostersEnabled: true,
  });
  const driver = await seedPerson(db, id, { firstName: FIRST_NAME, phone: PHONE });
  const passenger = await seedPerson(db, id, { firstName: "Marc" });
  for (const leg of ["aller", "retour"] as const) {
    const rideId = await seedRide(db, id, driver.id, { leg });
    await seedPlacement(db, { personId: passenger.id, eventId: id, leg, rideId });
  }
  await db.insertInto("email_link").values({ token_hash: randomBytes(32), kind: "confirmation", event_id: id }).execute();
  return { id, token };
}

/**
 * How many rows of each table hold `text`, anywhere in the row as Postgres writes it out.
 * Rows another test committed are counted too: compare with a count taken earlier in the
 * same transaction, whose snapshot (REPEATABLE READ) hides what is committed after it.
 */
async function rowsHolding(db: Db, text: string): Promise<Record<string, number>> {
  const { rows: tables } = await sql<{ name: string }>`
    select table_name as name from information_schema.tables
    where table_schema = current_schema() and table_type = 'BASE TABLE'`.execute(db);
  const counts: Record<string, number> = {};
  for (const { name } of tables) {
    const { rows } = await sql<{ n: string }>`
      select count(*) as n from ${sql.table(name)} as t where t::text like ${`%${text}%`}`.execute(db);
    counts[name] = Number(rows[0]!.n);
  }
  return counts;
}

/** Everything stored about the event, its own row and the rows that hang off it. */
async function everythingOf(db: Db, id: string) {
  return {
    event: await db.selectFrom("event").selectAll().where("id", "=", id).executeTakeFirst(),
    persons: await db.selectFrom("person").selectAll().where("event_id", "=", id).orderBy("id").execute(),
    rides: await db.selectFrom("ride").selectAll().where("event_id", "=", id).orderBy("id").execute(),
    placements: await db.selectFrom("placement").selectAll().where("event_id", "=", id).orderBy("person_id").orderBy("leg").execute(),
    links: await db.selectFrom("email_link").selectAll().where("event_id", "=", id).execute(),
  };
}

describe("OA2.7, DS4.4: an event without an account, on day 30", () => {
  it("is deleted whole: /e/{id} finds nothing, and no row references it nor holds its marker", async () => {
    await withRollback(async (trx) => {
      const markerBefore = await rowsHolding(trx, MARKER);
      const { id } = await seedFullEvent(trx);
      const idBefore = await rowsHolding(trx, id);

      expect(await purgeDayThirty(trx, DAY_THIRTY)).toEqual({ anonymised: 0, deleted: 1 });

      expect(await findPublicEvent(trx, id)).toBeUndefined();
      expect(Object.values(idBefore).some((n) => n > 0)).toBe(true);
      expect(await rowsHolding(trx, id)).toEqual(Object.fromEntries(Object.keys(idBefore).map((table) => [table, 0])));
      expect(await rowsHolding(trx, MARKER)).toEqual(markerBefore);
    });
  });

  it("is deleted too once anonymised, when its account is gone", async () => {
    await withRollback(async (trx) => {
      const { id } = await seedFullEvent(trx);
      const accountId = await confirmSeededEvent(trx, id);
      await purgeDayThirty(trx, DAY_THIRTY);
      await trx.deleteFrom("account").where("id", "=", accountId).execute();

      expect(await purgeDayThirty(trx, DAY_THIRTY)).toEqual({ anonymised: 0, deleted: 1 });
      expect(await findPublicEvent(trx, id)).toBeUndefined();
    });
  });
});

describe("OA8.1, DS4.1: an event with an account, on day 30", () => {
  it("is anonymised: no first name, number nor marker left in any table; the title, place, dates and options stay", async () => {
    await withRollback(async (trx) => {
      const before = {
        firstName: await rowsHolding(trx, FIRST_NAME),
        phone: await rowsHolding(trx, PHONE),
        marker: await rowsHolding(trx, MARKER),
      };
      const { id } = await seedFullEvent(trx);
      await confirmSeededEvent(trx, id);
      expect((await rowsHolding(trx, FIRST_NAME)).person).toBe(before.firstName.person + 1);
      expect((await rowsHolding(trx, PHONE)).person).toBe(before.phone.person + 1);
      expect((await rowsHolding(trx, MARKER)).event).toBe(before.marker.event + 1);
      const seeded = await everythingOf(trx, id);

      expect(await purgeDayThirty(trx, DAY_THIRTY)).toEqual({ anonymised: 1, deleted: 0 });

      expect(await rowsHolding(trx, FIRST_NAME)).toEqual(before.firstName);
      expect(await rowsHolding(trx, PHONE)).toEqual(before.phone);
      expect(await rowsHolding(trx, MARKER)).toEqual(before.marker);
      expect(await everythingOf(trx, id)).toEqual({
        event: {
          ...seeded.event,
          location_lat: null,
          location_lng: null,
          admin_token_hash: null,
          description: null,
          anonymised_at: expect.any(Date),
        },
        persons: [],
        rides: [],
        placements: [],
        links: [],
      });
      expect(await readAdminTokenHash(trx, id)).toBeNull();
    });
  });
});

describe("OA8.2, DS4.2", () => {
  it("on day 29, nothing is touched, the description included", async () => {
    await withRollback(async (trx) => {
      const confirmed = (await seedFullEvent(trx)).id;
      await confirmSeededEvent(trx, confirmed);
      const pending = (await seedFullEvent(trx)).id;
      const before = [await everythingOf(trx, confirmed), await everythingOf(trx, pending)];

      expect(await purgeDayThirty(trx, DAY_TWENTY_NINE)).toEqual({ anonymised: 0, deleted: 0 });

      expect([await everythingOf(trx, confirmed), await everythingOf(trx, pending)]).toEqual(before);
      expect(before[0]!.event?.description).toBe(`Appeler ${MARKER} au portail`);
    });
  });

  it("counts from the last leg: the aller of an event without a retour, the retour of one with", async () => {
    await withRollback(async (trx) => {
      const alone = (await seedEvent(trx, { allerAt: RETOUR, retourAt: null })).id;
      const later = (await seedEvent(trx, { allerAt: ALLER, retourAt: "1999-03-15 08:00:00" })).id;

      expect(await purgeDayThirty(trx, DAY_THIRTY)).toEqual({ anonymised: 0, deleted: 1 });
      expect(await findPublicEvent(trx, alone)).toBeUndefined();
      expect(await findPublicEvent(trx, later)).toBeDefined();
      // Day 30 of 1999-03-15 begins at 1999-04-13T22:00:00Z.
      expect(await purgeDayThirty(trx, new Date("1999-04-13T22:00:00Z"))).toEqual({ anonymised: 0, deleted: 1 });
      expect(await findPublicEvent(trx, later)).toBeUndefined();
    });
  });

  it("a second run changes nothing", async () => {
    await withRollback(async (trx) => {
      const { id } = await seedFullEvent(trx);
      await confirmSeededEvent(trx, id);
      await purgeDayThirty(trx, DAY_THIRTY);
      const once = await everythingOf(trx, id);

      expect(await purgeDayThirty(trx, DAY_THIRTY)).toEqual({ anonymised: 0, deleted: 0 });
      expect(await purgeDayThirty(trx, new Date("2001-01-01T00:00:00Z"))).toEqual({ anonymised: 0, deleted: 0 });

      expect(await everythingOf(trx, id)).toEqual(once);
    });
  });

  it("an event whose last leg was moved later is kept, as its day 30 now says", async () => {
    await withRollback(async (trx) => {
      const { id } = await seedFullEvent(trx);
      await confirmSeededEvent(trx, id);
      await trx.updateTable("event").set({ retour_at: "1999-04-20 18:00:00" }).where("id", "=", id).execute();
      const before = await everythingOf(trx, id);

      expect(await purgeDayThirty(trx, DAY_THIRTY)).toEqual({ anonymised: 0, deleted: 0 });
      expect(await everythingOf(trx, id)).toEqual(before);
    });
  });

  /** The sessions waiting for a lock that the session `pid` holds. */
  async function blockedBy(db: Db, pid: number): Promise<number[]> {
    for (let attempt = 0; attempt < 120; attempt++) {
      const { rows } = await sql<{ pid: number }>`
        select pid from pg_stat_activity where ${pid}::int = any(pg_blocking_pids(pid))`.execute(db);
      if (rows.length > 0) return rows.map((row) => row.pid);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error("the run never waited");
  }

  it("a run interrupted in the middle of an event leaves each event intact or anonymised whole (committed data)", async () => {
    const db = getDb();
    const seeded = [await seedFullEvent(db), await seedFullEvent(db), await seedFullEvent(db)];
    const accounts = [];
    for (const { id } of seeded) accounts.push(await confirmSeededEvent(db, id));
    // The run takes the events in the order of their ids: the first is done, the second interrupted.
    const [first, second, third] = seeded.map(({ id }) => id).sort();
    const holder = await db.startTransaction().execute();
    try {
      const before = { second: await everythingOf(db, second!), third: await everythingOf(db, third!) };
      // The second event's confirmation link, held: its anonymisation waits there, its persons already deleted.
      await holder.selectFrom("email_link").select("event_id").where("event_id", "=", second!).forUpdate().execute();
      const { rows } = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(holder);

      const run = purgeDayThirty(db, DAY_THIRTY);
      run.catch(() => {});
      for (const pid of await blockedBy(db, rows[0]!.pid)) await sql`select pg_cancel_backend(${pid}::int)`.execute(db);
      await expect(run).rejects.toThrow();
      await holder.rollback().execute();

      const firstAfter = await everythingOf(db, first!);
      expect(firstAfter.event).toMatchObject({
        anonymised_at: expect.any(Date),
        description: null,
        location_lat: null,
        location_lng: null,
        admin_token_hash: null,
      });
      expect(firstAfter).toMatchObject({ persons: [], rides: [], placements: [], links: [] });
      expect(await everythingOf(db, second!)).toEqual(before.second);
      expect(await everythingOf(db, third!)).toEqual(before.third);
    } finally {
      try {
        await holder.rollback().execute();
      } catch {
        // Already rolled back: nothing to give back.
      }
      await db.deleteFrom("event").where("id", "in", seeded.map(({ id }) => id)).execute();
      await db.deleteFrom("account").where("id", "in", accounts).execute();
    }
  });
});
