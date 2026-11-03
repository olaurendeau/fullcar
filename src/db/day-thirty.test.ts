import { randomBytes } from "node:crypto";
import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { anonymiseEvent, deleteEvent, findDayThirtyEvents } from "./day-thirty";
import { writeTransfer } from "./events";
import type { Database } from "./schema";
import { anAddress, seedLink } from "./test-accounts";
import { withRollback } from "./test-db";
import { confirmSeededEvent, seedEvent } from "./test-events";
import { seedPerson, seedPlacement, seedRide, seedStop } from "./test-participants";

type Db = Kysely<Database>;

// Dates long past, which no other test seeds: the rows committed by a concurrency test
// elsewhere, visible here, are never among those these tests count on.
const LAST_LEG = "1998-03-14";

/** An event with a person driving another on each leg, placed, a Stop on the aller, and a confirmation link. */
async function seedFullEvent(db: Db, fields: Parameters<typeof seedEvent>[1] = {}) {
  const { id } = await seedEvent(db, {
    allerAt: "1998-03-14 07:30:00",
    retourAt: "1998-03-14 18:00:00",
    locationPosition: { lat: 48.1, lng: -1.6 },
    description: "Appeler Zorglub4729",
    ...fields,
  });
  const marc = await seedPerson(db, id, { firstName: "Marc", phone: "06 12 34 56 78" });
  const lea = await seedPerson(db, id, { firstName: "Léa" });
  for (const leg of ["aller", "retour"] as const) {
    const rideId = await seedRide(db, id, marc.id, { leg });
    // Only the aller has Stops, and Léa boards at one.
    const stopId = leg === "aller" ? await seedStop(db, id, rideId) : null;
    await seedPlacement(db, { personId: lea.id, eventId: id, leg, rideId, stopId });
  }
  await db.insertInto("email_link").values({ token_hash: randomBytes(32), kind: "confirmation", event_id: id }).execute();
  return id;
}

/** How many rows of each table hang off the event. */
async function rowsOf(db: Db, eventId: string) {
  const count = async (table: "person" | "ride" | "placement" | "email_link" | "stop") => {
    const row = await db
      .selectFrom(table)
      .select((eb) => eb.fn.countAll<string>().as("n"))
      .where("event_id", "=", eventId)
      .executeTakeFirstOrThrow();
    return Number(row.n);
  };
  return {
    persons: await count("person"),
    rides: await count("ride"),
    placements: await count("placement"),
    links: await count("email_link"),
    stops: await count("stop"),
  };
}

const eventRow = (db: Db, id: string) => db.selectFrom("event").selectAll().where("id", "=", id).executeTakeFirst();

describe("findDayThirtyEvents", () => {
  it("takes the events whose last leg falls on the cutoff or before, whatever its hour", async () => {
    await withRollback(async (trx) => {
      const late = (await seedEvent(trx, { allerAt: `${LAST_LEG} 23:59:00`, retourAt: null })).id;
      const retourEarly = (await seedEvent(trx, { allerAt: "1998-03-01 08:00:00", retourAt: `${LAST_LEG} 00:00:00` })).id;
      const dayAfter = (await seedEvent(trx, { allerAt: "1998-03-15 00:00:00", retourAt: null })).id;
      const retourAfter = (await seedEvent(trx, { allerAt: "1998-03-10 08:00:00", retourAt: "1998-03-15 08:00:00" })).id;

      const found = await findDayThirtyEvents(trx, LAST_LEG);
      expect(found).toEqual(expect.arrayContaining([late, retourEarly]));
      expect(found).not.toContain(dayAfter);
      expect(found).not.toContain(retourAfter);
    });
  });

  it("leaves out an event already anonymised, but not one whose account is gone", async () => {
    await withRollback(async (trx) => {
      const anonymised = await seedFullEvent(trx);
      await confirmSeededEvent(trx, anonymised);
      await anonymiseEvent(trx, anonymised);
      const orphan = await seedFullEvent(trx);
      const accountId = await confirmSeededEvent(trx, orphan);
      await anonymiseEvent(trx, orphan);
      await trx.deleteFrom("account").where("id", "=", accountId).execute();

      const found = await findDayThirtyEvents(trx, LAST_LEG);
      expect(found).not.toContain(anonymised);
      expect(found).toContain(orphan);
    });
  });
});

describe("anonymiseEvent", () => {
  it("OA8.1, DS4.1, RV8.1: deletes the persons, rides, stops, placements and confirmation links, and nulls the position, the token and the description", async () => {
    await withRollback(async (trx) => {
      const id = await seedFullEvent(trx);
      await confirmSeededEvent(trx, id);
      const before = await eventRow(trx, id);
      expect(await rowsOf(trx, id)).toEqual({ persons: 2, rides: 2, placements: 2, links: 1, stops: 1 });

      await anonymiseEvent(trx, id);

      expect(await rowsOf(trx, id)).toEqual({ persons: 0, rides: 0, placements: 0, links: 0, stops: 0 });
      const after = await eventRow(trx, id);
      expect(after).toEqual({
        ...before,
        location_lat: null,
        location_lng: null,
        admin_token_hash: null,
        description: null,
        anonymised_at: expect.any(Date),
      });
    });
  });

  // OT7.1: without it, `event_transfer_open` refuses the anonymisation of an event that is being handed over.
  it("OT7.1: erases the handover that waits, its address and its result, and its transfer links, and nothing of another event's", async () => {
    await withRollback(async (trx) => {
      const id = await seedFullEvent(trx);
      await confirmSeededEvent(trx, id);
      const email = anAddress();
      await writeTransfer(trx, id, { email, status: "sending", at: new Date() });
      await seedLink(trx, { kind: "transfer", eventId: id });
      await seedLink(trx, { kind: "transfer", eventId: id }, { usedAt: new Date() });
      const other = await seedFullEvent(trx);
      await confirmSeededEvent(trx, other);
      const otherEmail = anAddress();
      await writeTransfer(trx, other, { email: otherEmail, status: "sending", at: new Date() });
      await seedLink(trx, { kind: "transfer", eventId: other });

      await anonymiseEvent(trx, id);

      const after = await eventRow(trx, id);
      expect(after).toMatchObject({ transfer_email: null, transfer_status: null, transfer_status_at: null, anonymised_at: expect.any(Date) });
      expect(await rowsOf(trx, id)).toMatchObject({ links: 0 });
      expect(JSON.stringify(after)).not.toContain(email);
      expect(await eventRow(trx, other)).toMatchObject({ transfer_email: otherEmail });
      expect(await rowsOf(trx, other)).toMatchObject({ links: 2 });
    });
  });

  // RV8.1: the Stops and the boarding choices go with the car, nothing of them is kept.
  it("RV8.1: leaves no Stop and no boarding Stop behind", async () => {
    await withRollback(async (trx) => {
      const id = await seedFullEvent(trx);
      await confirmSeededEvent(trx, id);
      const boarded = () =>
        trx
          .selectFrom("placement")
          .select((eb) => eb.fn.countAll<string>().as("n"))
          .where("event_id", "=", id)
          .where("stop_id", "is not", null)
          .executeTakeFirstOrThrow();
      expect(Number((await boarded()).n)).toBe(1);

      await anonymiseEvent(trx, id);

      expect(await trx.selectFrom("stop").select("id").where("event_id", "=", id).execute()).toEqual([]);
      expect(Number((await boarded()).n)).toBe(0);
    });
  });

  it("leaves the other events as they are", async () => {
    await withRollback(async (trx) => {
      const id = await seedFullEvent(trx);
      await confirmSeededEvent(trx, id);
      const other = await seedFullEvent(trx);
      const before = await eventRow(trx, other);

      await anonymiseEvent(trx, id);

      expect(await rowsOf(trx, other)).toEqual({ persons: 2, rides: 2, placements: 2, links: 1, stops: 1 });
      expect(await eventRow(trx, other)).toEqual(before);
    });
  });
});

describe("deleteEvent", () => {
  it("OA2.7, DS4.4, RV8.1: deletes the event, and its rows by cascade, its Stops too; the others stay", async () => {
    await withRollback(async (trx) => {
      const id = await seedFullEvent(trx);
      const other = await seedFullEvent(trx);

      await deleteEvent(trx, id);

      expect(await eventRow(trx, id)).toBeUndefined();
      expect(await rowsOf(trx, id)).toEqual({ persons: 0, rides: 0, placements: 0, links: 0, stops: 0 });
      expect(await rowsOf(trx, other)).toEqual({ persons: 2, rides: 2, placements: 2, links: 1, stops: 1 });
    });
  });
});
