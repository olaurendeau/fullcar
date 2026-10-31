import { randomUUID } from "node:crypto";
import { sql, type Insertable, type Selectable, type Transaction } from "kysely";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { Database, PlacementTable, StopTable } from "./schema";
import { withRollback } from "./test-db";
import { seedEvent } from "./test-events";
import { seedPerson, seedPlacement, seedRide, seedStop } from "./test-participants";

type Trx = Transaction<Database>;

/** A Ride with its driver, in a new event. */
async function aRide(trx: Trx, leg: "aller" | "retour" = "aller") {
  const { id: eventId } = await seedEvent(trx);
  const driver = await seedPerson(trx, eventId);
  const rideId = await seedRide(trx, eventId, driver.id, { leg });
  return { eventId, rideId };
}

/** Another Ride of the event, driven by someone else. */
async function anotherRide(trx: Trx, eventId: string) {
  return seedRide(trx, eventId, (await seedPerson(trx, eventId)).id);
}

/** A Stop written as the table has it, for the rows the helper would not write. */
async function addStop(trx: Trx, eventId: string, rideId: string, fields: Partial<Insertable<StopTable>> = {}) {
  await trx
    .insertInto("stop")
    .values({
      id: randomUUID(),
      event_id: eventId,
      ride_id: rideId,
      leg: "aller",
      location: "Place de l'église",
      stop_time: "07:30:00",
      rank: 0,
      ...fields,
    })
    .execute();
}

/** The write is refused, and by the constraint named: not by some other one. */
async function expectRefusedBy(write: (trx: Trx) => Promise<unknown>, constraint: string, code: string) {
  await expect(withRollback(write)).rejects.toMatchObject({ constraint, code });
}

/** A passenger of the event, placed in the Ride. */
async function passengerIn(trx: Trx, eventId: string, rideId: string, stopId?: string | null) {
  const { id: personId } = await seedPerson(trx, eventId);
  await seedPlacement(trx, { personId, eventId, leg: "aller", rideId, stopId });
  return personId;
}

const placementOf = (trx: Trx, personId: string) =>
  trx.selectFrom("placement").selectAll().where("person_id", "=", personId).executeTakeFirstOrThrow();

describe("stop table", () => {
  // RV8.2: a place, a time, a position and a rank; no name, no number, no token.
  it("has exactly the columns of a Stop, and none that holds a person", async () => {
    const { rows } = await withRollback((trx) =>
      sql<{ name: string; type: string; nullable: string; default: string | null }>`
        select column_name as name, data_type as type, is_nullable as nullable, column_default as default
        from information_schema.columns
        where table_schema = 'public' and table_name = 'stop'
        order by ordinal_position`.execute(trx),
    );
    expect(rows).toEqual([
      { name: "id", type: "uuid", nullable: "NO", default: null },
      { name: "event_id", type: "text", nullable: "NO", default: null },
      { name: "ride_id", type: "uuid", nullable: "NO", default: null },
      { name: "leg", type: "text", nullable: "NO", default: null },
      { name: "location", type: "text", nullable: "NO", default: null },
      { name: "location_lat", type: "double precision", nullable: "YES", default: null },
      { name: "location_lng", type: "double precision", nullable: "YES", default: null },
      { name: "stop_time", type: "time without time zone", nullable: "NO", default: null },
      { name: "rank", type: "smallint", nullable: "NO", default: null },
      { name: "created_at", type: "timestamp with time zone", nullable: "NO", default: "now()" },
    ]);
    const names = rows.map((row) => row.name);
    for (const personal of ["phone", "first_name", "person_id", "driver_id", "token_hash", "note"]) {
      expect(names).not.toContain(personal);
    }
  });

  it("keeps its time to the second", async () => {
    const { rows } = await withRollback((trx) =>
      sql<{ precision: number }>`
        select datetime_precision as precision from information_schema.columns
        where table_schema = 'public' and table_name = 'stop' and column_name = 'stop_time'`.execute(trx),
    );
    expect(rows).toEqual([{ precision: 0 }]);
  });

  it("types the leg, and never lets created_at be written", () => {
    expectTypeOf<Selectable<StopTable>["leg"]>().toEqualTypeOf<"aller">();
    expectTypeOf<Insertable<StopTable>>().not.toHaveProperty("created_at");
    expectTypeOf<Selectable<PlacementTable>["stop_id"]>().toEqualTypeOf<string | null>();
  });

  it("gives back what was written, with the id drawn by the client", async () => {
    const row = await withRollback(async (trx) => {
      const { eventId, rideId } = await aRide(trx);
      const id = randomUUID();
      await addStop(trx, eventId, rideId, {
        id,
        location: "Mairie de Pacé",
        location_lat: 48.14,
        location_lng: -1.76,
        stop_time: "07:40:00",
        rank: 3,
      });
      return trx.selectFrom("stop").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
    });
    expect(row).toMatchObject({
      leg: "aller",
      location: "Mairie de Pacé",
      location_lat: 48.14,
      location_lng: -1.76,
      stop_time: "07:40:00",
      rank: 3,
    });
    expect(row.created_at).toBeInstanceOf(Date);
  });

  it("is keyed by its id", async () => {
    await expectRefusedBy(async (trx) => {
      const { eventId, rideId } = await aRide(trx);
      const id = randomUUID();
      await addStop(trx, eventId, rideId, { id });
      await addStop(trx, eventId, rideId, { id, rank: 1 });
    }, "stop_pkey", "23505");
  });

  // Counted in code points, as the domain does: a car emoji is one, though two UTF-16 units.
  it("accepts a location of 120 code points, and refuses 121 or none", async () => {
    const stored = await withRollback(async (trx) => {
      const { eventId, rideId } = await aRide(trx);
      await addStop(trx, eventId, rideId, { location: "🚗".repeat(120) });
      return (await trx.selectFrom("stop").select("location").where("ride_id", "=", rideId).executeTakeFirstOrThrow())
        .location;
    });
    expect(stored).toBe("🚗".repeat(120));
    for (const location of ["🚗".repeat(121), ""]) {
      await expectRefusedBy(async (trx) => {
        const { eventId, rideId } = await aRide(trx);
        await addStop(trx, eventId, rideId, { location });
      }, "stop_location_length", "23514");
    }
  });

  describe("position", () => {
    it("takes both coordinates or none, within the bounds", async () => {
      await withRollback(async (trx) => {
        const { eventId, rideId } = await aRide(trx);
        await addStop(trx, eventId, rideId, { rank: 0 });
        await addStop(trx, eventId, rideId, { rank: 1, location_lat: -90, location_lng: 180 });
        await addStop(trx, eventId, rideId, { rank: 2, location_lat: 90, location_lng: -180 });
      });
    });

    it.each([
      ["a latitude without a longitude", { location_lat: 48.1 }, "stop_location_position_pair"],
      ["a longitude without a latitude", { location_lng: -1.6 }, "stop_location_position_pair"],
      ["a latitude above 90", { location_lat: 90.1, location_lng: 0 }, "stop_location_lat_range"],
      ["a latitude below -90", { location_lat: -90.1, location_lng: 0 }, "stop_location_lat_range"],
      ["a longitude above 180", { location_lat: 0, location_lng: 180.1 }, "stop_location_lng_range"],
      ["a longitude below -180", { location_lat: 0, location_lng: -180.1 }, "stop_location_lng_range"],
    ])("refuses %s", async (_, fields, constraint) => {
      await expectRefusedBy(async (trx) => {
        const { eventId, rideId } = await aRide(trx);
        await addStop(trx, eventId, rideId, fields);
      }, constraint, "23514");
    });
  });

  // Out of scope for V1: the return trip has no Stop.
  it("refuses the retour leg", async () => {
    await expectRefusedBy(async (trx) => {
      const { eventId, rideId } = await aRide(trx, "retour");
      await addStop(trx, eventId, rideId, { leg: "retour" as "aller" });
    }, "stop_leg", "23514");
  });

  describe("rank", () => {
    it("takes ranks 0 to 5, so six Stops in a Ride", async () => {
      await withRollback(async (trx) => {
        const { eventId, rideId } = await aRide(trx);
        for (const rank of [0, 1, 2, 3, 4, 5]) await addStop(trx, eventId, rideId, { rank });
        await sql`set constraints stop_ride_rank_unique immediate`.execute(trx);
      });
    });

    it.each([6, -1])("refuses the rank %i: no seventh Stop", async (rank) => {
      await expectRefusedBy(async (trx) => {
        const { eventId, rideId } = await aRide(trx);
        await addStop(trx, eventId, rideId, { rank });
      }, "stop_rank_range", "23514");
    });

    it("refuses two Stops of a Ride with the same rank, at the latest at the end of the transaction", async () => {
      await expectRefusedBy(async (trx) => {
        const { eventId, rideId } = await aRide(trx);
        await addStop(trx, eventId, rideId, { rank: 2 });
        await addStop(trx, eventId, rideId, { rank: 2, location: "Gare de Rennes" });
        await sql`set constraints stop_ride_rank_unique immediate`.execute(trx);
      }, "stop_ride_rank_unique", "23505");
    });

    it("lets two Stops swap their ranks in one transaction", async () => {
      const stops = await withRollback(async (trx) => {
        const { eventId, rideId } = await aRide(trx);
        const a = await seedStop(trx, eventId, rideId, { rank: 0 });
        const b = await seedStop(trx, eventId, rideId, { rank: 1 });
        await trx.updateTable("stop").set({ rank: 1 }).where("id", "=", a).execute();
        await trx.updateTable("stop").set({ rank: 0 }).where("id", "=", b).execute();
        await sql`set constraints stop_ride_rank_unique immediate`.execute(trx);
        return { a, b, rows: await trx.selectFrom("stop").select(["id", "rank"]).where("ride_id", "=", rideId).orderBy("rank").execute() };
      });
      expect(stops.rows).toEqual([
        { id: stops.b, rank: 0 },
        { id: stops.a, rank: 1 },
      ]);
    });

    it("numbers the Stops of each Ride on its own", async () => {
      await withRollback(async (trx) => {
        const { eventId, rideId } = await aRide(trx);
        await addStop(trx, eventId, rideId, { rank: 0 });
        await addStop(trx, eventId, await anotherRide(trx, eventId), { rank: 0 });
        await sql`set constraints stop_ride_rank_unique immediate`.execute(trx);
      });
    });
  });

  describe("its Ride", () => {
    it("is refused for a Ride that does not exist", async () => {
      await expectRefusedBy(async (trx) => {
        const { eventId } = await aRide(trx);
        await addStop(trx, eventId, randomUUID());
      }, "stop_ride_fk", "23503");
    });

    it("is refused for the Ride of another event", async () => {
      await expectRefusedBy(async (trx) => {
        const { rideId } = await aRide(trx);
        const { id: otherEvent } = await seedEvent(trx);
        await addStop(trx, otherEvent, rideId);
      }, "stop_ride_fk", "23503");
    });

    it("is refused for a Ride of the retour, even said to be on the aller", async () => {
      await expectRefusedBy(async (trx) => {
        const { eventId, rideId } = await aRide(trx, "retour");
        await addStop(trx, eventId, rideId, { leg: "aller" });
      }, "stop_ride_fk", "23503");
    });

    it("is deleted with its Ride, by cascade", async () => {
      await withRollback(async (trx) => {
        const { eventId, rideId } = await aRide(trx);
        await addStop(trx, eventId, rideId);
        await trx.deleteFrom("ride").where("id", "=", rideId).execute();
        expect(await trx.selectFrom("stop").select("id").where("event_id", "=", eventId).execute()).toEqual([]);
      });
    });

    // Deleting the event also goes through the Ride: this key is the rule of the purge, written
    // on its own.
    it("holds to its event, by a key that cascades", async () => {
      const { rows } = await withRollback((trx) =>
        sql<{ definition: string }>`
          select pg_get_constraintdef(oid) as definition from pg_constraint
          where conrelid = 'stop'::regclass and conname = 'stop_event_fk'`.execute(trx),
      );
      expect(rows).toEqual([{ definition: "FOREIGN KEY (event_id) REFERENCES event(id) ON DELETE CASCADE" }]);
    });
  });

  describe("placement.stop_id", () => {
    it("holds a Stop of the Ride the person is in", async () => {
      const placement = await withRollback(async (trx) => {
        const { eventId, rideId } = await aRide(trx);
        const stopId = await seedStop(trx, eventId, rideId);
        const personId = await passengerIn(trx, eventId, rideId, stopId);
        return { stopId, row: await placementOf(trx, personId) };
      });
      expect(placement.row.stop_id).toBe(placement.stopId);
    });

    it("is refused for a Stop of another Ride, when written with the Placement", async () => {
      await expectRefusedBy(async (trx) => {
        const { eventId, rideId } = await aRide(trx);
        const stopId = await seedStop(trx, eventId, await anotherRide(trx, eventId));
        await passengerIn(trx, eventId, rideId, stopId);
      }, "placement_stop_on_ride", "23514");
    });

    it("is refused for a Stop of another Ride, when written alone", async () => {
      await expectRefusedBy(async (trx) => {
        const { eventId, rideId } = await aRide(trx);
        const stopId = await seedStop(trx, eventId, await anotherRide(trx, eventId));
        const personId = await passengerIn(trx, eventId, rideId);
        await trx.updateTable("placement").set({ stop_id: stopId }).where("person_id", "=", personId).execute();
      }, "placement_stop_on_ride", "23514");
    });

    it("is refused for a Stop that does not exist", async () => {
      await expectRefusedBy(async (trx) => {
        const { eventId, rideId } = await aRide(trx);
        await passengerIn(trx, eventId, rideId, randomUUID());
      }, "placement_stop_on_ride", "23514");
    });

    it("is refused without a car", async () => {
      await expectRefusedBy(async (trx) => {
        const { eventId, rideId } = await aRide(trx);
        const stopId = await seedStop(trx, eventId, rideId);
        const { id: personId } = await seedPerson(trx, eventId);
        await trx
          .insertInto("placement")
          .values({ person_id: personId, event_id: eventId, leg: "aller", ride_id: null, stop_id: stopId })
          .execute();
      }, "placement_stop_in_car", "23514");
    });

    // RV6.1, RV6.3
    it("goes back to null when the Stop is deleted, the person staying in the Ride", async () => {
      await withRollback(async (trx) => {
        const { eventId, rideId } = await aRide(trx);
        const gone = await seedStop(trx, eventId, rideId);
        const stays = await seedStop(trx, eventId, rideId);
        const aboard = await passengerIn(trx, eventId, rideId, gone);
        const other = await passengerIn(trx, eventId, rideId, stays);

        await trx.deleteFrom("stop").where("id", "=", gone).execute();

        expect(await placementOf(trx, aboard)).toMatchObject({ ride_id: rideId, stop_id: null });
        expect(await placementOf(trx, other)).toMatchObject({ ride_id: rideId, stop_id: stays });
      });
    });

    // RV6.2
    it("goes back to null with the car when the Ride is deleted, without an error", async () => {
      await withRollback(async (trx) => {
        const { eventId, rideId } = await aRide(trx);
        const stopId = await seedStop(trx, eventId, rideId);
        const personId = await passengerIn(trx, eventId, rideId, stopId);

        await trx.deleteFrom("ride").where("id", "=", rideId).execute();

        expect(await placementOf(trx, personId)).toMatchObject({ ride_id: null, stop_id: null, leg: "aller" });
        expect(await trx.selectFrom("stop").select("id").where("id", "=", stopId).execute()).toEqual([]);
      });
    });

    // RV6.2: writing ride_id alone is enough, the trigger drops the Stop of the old car.
    it("goes back to null when ride_id alone is written, to another car", async () => {
      await withRollback(async (trx) => {
        const { eventId, rideId } = await aRide(trx);
        const other = await anotherRide(trx, eventId);
        const stopId = await seedStop(trx, eventId, rideId);
        const personId = await passengerIn(trx, eventId, rideId, stopId);

        await trx.updateTable("placement").set({ ride_id: other }).where("person_id", "=", personId).execute();

        expect(await placementOf(trx, personId)).toMatchObject({ ride_id: other, stop_id: null });
      });
    });

    it("goes back to null when ride_id alone is written to null", async () => {
      await withRollback(async (trx) => {
        const { eventId, rideId } = await aRide(trx);
        const stopId = await seedStop(trx, eventId, rideId);
        const personId = await passengerIn(trx, eventId, rideId, stopId);

        await trx.updateTable("placement").set({ ride_id: null }).where("person_id", "=", personId).execute();

        expect(await placementOf(trx, personId)).toMatchObject({ ride_id: null, stop_id: null });
      });
    });

    it("moves to another car with its Stop when both are written", async () => {
      await withRollback(async (trx) => {
        const { eventId, rideId } = await aRide(trx);
        const other = await anotherRide(trx, eventId);
        const stopId = await seedStop(trx, eventId, other);
        const personId = await passengerIn(trx, eventId, rideId);

        await trx
          .updateTable("placement")
          .set({ ride_id: other, stop_id: stopId })
          .where("person_id", "=", personId)
          .execute();

        expect(await placementOf(trx, personId)).toMatchObject({ ride_id: other, stop_id: stopId });
      });
    });
  });
});
