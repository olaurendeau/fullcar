import { randomUUID } from "node:crypto";
import { sql, type ControlledTransaction, type Insertable, type Kysely, type Selectable, type Transaction } from "kysely";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { Database, PersonTable, PlacementTable, RideTable } from "./schema";
import { withCommittedEvent } from "./test-committed";
import { withRollback } from "./test-db";
import { seedEvent } from "./test-events";

const HASH = Buffer.alloc(32, 7);

type Trx = Transaction<Database>;
/** A transaction, or the connection itself for committed data. */
type Db = Kysely<Database>;
type Leg = "aller" | "retour";

async function addPerson(trx: Db, eventId: string, fields: Partial<Insertable<PersonTable>> = {}) {
  const id = randomUUID();
  await trx
    .insertInto("person")
    .values({ id, event_id: eventId, first_name: "Léa", token_hash: HASH, ...fields })
    .execute();
  return id;
}

async function addRide(
  trx: Db,
  eventId: string,
  driverId: string,
  fields: Partial<Insertable<RideTable>> = {},
) {
  const id = randomUUID();
  await trx
    .insertInto("ride")
    .values({
      id,
      event_id: eventId,
      leg: "aller",
      driver_id: driverId,
      location: "Mairie de Cesson",
      departure_time: "07:15:00",
      seats: 3,
      ...fields,
    })
    .execute();
  return id;
}

async function place(trx: Db, eventId: string, personId: string, leg: Leg, rideId: string | null) {
  await trx
    .insertInto("placement")
    .values({ person_id: personId, event_id: eventId, leg, ride_id: rideId })
    .execute();
}

/** An event with one person in it, for a test that only needs a place to write. */
async function anEvent(trx: Trx) {
  const { id } = await seedEvent(trx);
  return { eventId: id, personId: await addPerson(trx, id) };
}

/** The writes are refused, and by the constraint named: not by some other one. */
async function expectRefusedBy(write: (trx: Trx) => Promise<unknown>, constraint: unknown) {
  await expect(withRollback(write)).rejects.toMatchObject({ constraint });
}

function columns(trx: Trx, table: string) {
  return sql<{ name: string; type: string; nullable: string; default: string | null }>`
    select column_name as name, data_type as type, is_nullable as nullable,
           column_default as default
    from information_schema.columns
    where table_schema = 'public' and table_name = ${table}
    order by ordinal_position`.execute(trx);
}

describe("participant tables", () => {
  // C12.5: what the glossary lists, plus identifiers and technical timestamps. No IP
  // address, no user agent, and no column for a token: only the hash of one.
  it("person has exactly the columns of a Person", async () => {
    const { rows } = await withRollback((trx) => columns(trx, "person"));
    expect(rows).toEqual([
      { name: "id", type: "uuid", nullable: "NO", default: null },
      { name: "event_id", type: "text", nullable: "NO", default: null },
      { name: "first_name", type: "text", nullable: "NO", default: null },
      { name: "phone", type: "text", nullable: "YES", default: null },
      { name: "token_hash", type: "bytea", nullable: "NO", default: null },
      { name: "created_at", type: "timestamp with time zone", nullable: "NO", default: "now()" },
    ]);
  });

  it("ride has exactly the columns of a Ride, its time to the second", async () => {
    const { rows } = await withRollback((trx) => columns(trx, "ride"));
    expect(rows).toEqual([
      { name: "id", type: "uuid", nullable: "NO", default: null },
      { name: "event_id", type: "text", nullable: "NO", default: null },
      { name: "leg", type: "text", nullable: "NO", default: null },
      { name: "driver_id", type: "uuid", nullable: "NO", default: null },
      { name: "location", type: "text", nullable: "NO", default: null },
      { name: "departure_time", type: "time without time zone", nullable: "NO", default: null },
      { name: "seats", type: "smallint", nullable: "NO", default: null },
      { name: "note", type: "text", nullable: "YES", default: null },
      { name: "created_at", type: "timestamp with time zone", nullable: "NO", default: "now()" },
    ]);
    const { rows: precision } = await withRollback((trx) =>
      sql<{ precision: number }>`
        select datetime_precision as precision from information_schema.columns
        where table_schema = 'public' and table_name = 'ride'
          and column_name = 'departure_time'`.execute(trx),
    );
    expect(precision).toEqual([{ precision: 0 }]);
  });

  it("placement has exactly the columns of a Placement", async () => {
    const { rows } = await withRollback((trx) => columns(trx, "placement"));
    expect(rows).toEqual([
      { name: "person_id", type: "uuid", nullable: "NO", default: null },
      { name: "event_id", type: "text", nullable: "NO", default: null },
      { name: "leg", type: "text", nullable: "NO", default: null },
      { name: "ride_id", type: "uuid", nullable: "YES", default: null },
      { name: "placed_at", type: "timestamp with time zone", nullable: "NO", default: "now()" },
    ]);
  });

  it("types the leg, and never lets the timestamps be written", () => {
    expectTypeOf<Selectable<RideTable>["leg"]>().toEqualTypeOf<Leg>();
    expectTypeOf<Selectable<PlacementTable>["leg"]>().toEqualTypeOf<Leg>();
    expectTypeOf<Insertable<PersonTable>>().not.toHaveProperty("created_at");
    expectTypeOf<Insertable<RideTable>>().not.toHaveProperty("created_at");
    expectTypeOf<Insertable<PlacementTable>>().not.toHaveProperty("placed_at");
  });

  it("gives back what was written, with the ids drawn by the client", async () => {
    const rows = await withRollback(async (trx) => {
      const { eventId, personId } = await anEvent(trx);
      const rideId = await addRide(trx, eventId, personId, { note: "Coffre plein" });
      const passengerId = await addPerson(trx, eventId, { phone: "06 12 34 56 78" });
      await place(trx, eventId, passengerId, "aller", rideId);
      return {
        rideId,
        passengerId,
        person: await trx.selectFrom("person").selectAll().where("id", "=", passengerId).executeTakeFirstOrThrow(),
        ride: await trx.selectFrom("ride").selectAll().where("id", "=", rideId).executeTakeFirstOrThrow(),
        placement: await trx
          .selectFrom("placement")
          .selectAll()
          .where("event_id", "=", eventId)
          .executeTakeFirstOrThrow(),
      };
    });
    expect(rows.person).toMatchObject({ id: rows.passengerId, first_name: "Léa", phone: "06 12 34 56 78" });
    expect(rows.person.token_hash).toEqual(HASH);
    expect(rows.person.created_at).toBeInstanceOf(Date);
    expect(rows.ride).toMatchObject({
      id: rows.rideId,
      leg: "aller",
      departure_time: "07:15:00",
      seats: 3,
      note: "Coffre plein",
    });
    expect(rows.placement).toMatchObject({ person_id: rows.passengerId, leg: "aller", ride_id: rows.rideId });
    expect(rows.placement.placed_at).toBeInstanceOf(Date);
  });

  describe("person", () => {
    it("is keyed by its id", async () => {
      await expectRefusedBy(async (trx) => {
        const { eventId, personId } = await anEvent(trx);
        await addPerson(trx, eventId, { id: personId });
      }, "person_pkey");
    });

    it("belongs to an existing event", async () => {
      await expectRefusedBy((trx) => addPerson(trx, "Zz9zZz9z"), "person_event_fk");
    });

    // C12.1
    it.each([31, 33, 0])("refuses a token hash of %i bytes", async (size) => {
      await expectRefusedBy(async (trx) => {
        const { id } = await seedEvent(trx);
        await addPerson(trx, id, { token_hash: Buffer.alloc(size, 7) });
      }, "person_token_hash_length");
    });

    // Counted in code points, as the domain does: a car emoji is one, though two UTF-16 units.
    it("accepts a first name of 40 code points and refuses 41, or none", async () => {
      const name = await withRollback(async (trx) => {
        const { eventId } = await anEvent(trx);
        const id = await addPerson(trx, eventId, { first_name: "🚗".repeat(40) });
        return (await trx.selectFrom("person").select("first_name").where("id", "=", id).executeTakeFirstOrThrow())
          .first_name;
      });
      expect(name).toBe("🚗".repeat(40));
      for (const first_name of ["🚗".repeat(41), ""]) {
        await expectRefusedBy(async (trx) => {
          const { id } = await seedEvent(trx);
          await addPerson(trx, id, { first_name });
        }, "person_first_name_length");
      }
    });

    it.each([
      ["6 digits", "06 12 34"],
      ["15 digits", "+33 6 12 34 56 78 90 12"],
      ["25 characters", "(+33) 6 12 . 34 . 56 . 78"],
      ["no phone at all", null],
    ])("accepts a phone of %s", async (_, phone) => {
      const stored = await withRollback(async (trx) => {
        const { eventId } = await anEvent(trx);
        const id = await addPerson(trx, eventId, { phone });
        return (await trx.selectFrom("person").select("phone").where("id", "=", id).executeTakeFirstOrThrow()).phone;
      });
      expect(stored).toBe(phone);
    });

    it.each([
      ["5 digits", "06 12 3", "person_phone_digits"],
      ["16 digits", "+33 6 12 34 56 78 90 123", "person_phone_digits"],
      ["26 characters", "(+33) 6 12 . 34 . 56 . 789", "person_phone_format"],
      ["a letter", "06 12 34 56 7a", "person_phone_format"],
      ["a slash", "06/12/34/56/78", "person_phone_format"],
      // Both checks refuse it, and Postgres does not say in which order it runs them.
      ["nothing in it", "", expect.stringMatching(/^person_phone_(format|digits)$/)],
    ])("refuses a phone of %s", async (_, phone, constraint) => {
      await expectRefusedBy(async (trx) => {
        const { id } = await seedEvent(trx);
        await addPerson(trx, id, { phone });
      }, constraint);
    });
  });

  describe("ride", () => {
    it("is keyed by its id", async () => {
      await expectRefusedBy(async (trx) => {
        const { eventId, personId } = await anEvent(trx);
        const id = await addRide(trx, eventId, personId);
        await addRide(trx, eventId, personId, { id, leg: "retour" });
      }, "ride_pkey");
    });

    it("refuses a leg that is neither aller nor retour", async () => {
      await expectRefusedBy(async (trx) => {
        const { eventId, personId } = await anEvent(trx);
        await sql`
          insert into ride (id, event_id, leg, driver_id, location, departure_time, seats)
          values (${randomUUID()}, ${eventId}, 'aller-retour', ${personId}, 'Mairie', '07:15', 3)`.execute(trx);
      }, "ride_leg");
    });

    it("refuses a driver from another event", async () => {
      await expectRefusedBy(async (trx) => {
        const { eventId } = await anEvent(trx);
        const other = await anEvent(trx);
        await addRide(trx, eventId, other.personId);
      }, "ride_driver_fk");
    });

    it.each([
      ["location", 120, "ride_location_length"],
      ["note", 200, "ride_note_length"],
    ] as const)("accepts a %s of %i code points and refuses one more", async (column, max, constraint) => {
      const stored = await withRollback(async (trx) => {
        const { eventId, personId } = await anEvent(trx);
        const id = await addRide(trx, eventId, personId, { [column]: "🚗".repeat(max) });
        return (await trx.selectFrom("ride").select(column).where("id", "=", id).executeTakeFirstOrThrow())[column];
      });
      expect(stored).toBe("🚗".repeat(max));
      await expectRefusedBy(async (trx) => {
        const { eventId, personId } = await anEvent(trx);
        await addRide(trx, eventId, personId, { [column]: "🚗".repeat(max + 1) });
      }, constraint);
    });

    it("refuses an empty location, and accepts no note", async () => {
      await expectRefusedBy(async (trx) => {
        const { eventId, personId } = await anEvent(trx);
        await addRide(trx, eventId, personId, { location: "" });
      }, "ride_location_length");
      const note = await withRollback(async (trx) => {
        const { eventId, personId } = await anEvent(trx);
        const id = await addRide(trx, eventId, personId, { note: null });
        return (await trx.selectFrom("ride").select("note").where("id", "=", id).executeTakeFirstOrThrow()).note;
      });
      expect(note).toBeNull();
    });

    it.each([1, 8])("accepts %i seats", async (seats) => {
      const stored = await withRollback(async (trx) => {
        const { eventId, personId } = await anEvent(trx);
        const id = await addRide(trx, eventId, personId, { seats });
        return (await trx.selectFrom("ride").select("seats").where("id", "=", id).executeTakeFirstOrThrow()).seats;
      });
      expect(stored).toBe(seats);
    });

    it.each([0, 9])("refuses %i seats", async (seats) => {
      await expectRefusedBy(async (trx) => {
        const { eventId, personId } = await anEvent(trx);
        await addRide(trx, eventId, personId, { seats });
      }, "ride_seats_range");
    });

    // C4.6
    it("refuses a second ride by the same driver on the same leg", async () => {
      await expectRefusedBy(async (trx) => {
        const { eventId, personId } = await anEvent(trx);
        await addRide(trx, eventId, personId);
        await addRide(trx, eventId, personId, { location: "Gare" });
      }, "ride_driver_leg_unique");
    });

    it("accepts a ride by the same driver on the other leg", async () => {
      const legs = await withRollback(async (trx) => {
        const { eventId, personId } = await anEvent(trx);
        await addRide(trx, eventId, personId, { leg: "aller" });
        await addRide(trx, eventId, personId, { leg: "retour" });
        return trx.selectFrom("ride").select("leg").where("driver_id", "=", personId).orderBy("leg").execute();
      });
      expect(legs).toEqual([{ leg: "aller" }, { leg: "retour" }]);
    });
  });

  describe("placement", () => {
    // C12.6
    it("allows one placement per person and leg", async () => {
      await expectRefusedBy(async (trx) => {
        const { eventId, personId } = await anEvent(trx);
        const driverId = await addPerson(trx, eventId);
        const rideId = await addRide(trx, eventId, driverId);
        await place(trx, eventId, personId, "aller", null);
        await place(trx, eventId, personId, "aller", rideId);
      }, "placement_pkey");
    });

    it("accepts a placement on each leg, with or without a car", async () => {
      const rows = await withRollback(async (trx) => {
        const { eventId, personId } = await anEvent(trx);
        const driverId = await addPerson(trx, eventId);
        const rideId = await addRide(trx, eventId, driverId);
        await place(trx, eventId, personId, "aller", rideId);
        await place(trx, eventId, personId, "retour", null);
        return trx
          .selectFrom("placement")
          .select(["leg", "ride_id"])
          .where("event_id", "=", eventId)
          .orderBy("leg")
          .execute();
      });
      expect(rows).toEqual([
        { leg: "aller", ride_id: expect.any(String) },
        { leg: "retour", ride_id: null },
      ]);
    });

    it("refuses a leg that is neither aller nor retour", async () => {
      await expectRefusedBy(async (trx) => {
        const { eventId, personId } = await anEvent(trx);
        await sql`
          insert into placement (person_id, event_id, leg)
          values (${personId}, ${eventId}, 'aller-retour')`.execute(trx);
      }, "placement_leg");
    });

    // C12.7
    it("refuses a ride of the other leg", async () => {
      await expectRefusedBy(async (trx) => {
        const { eventId, personId } = await anEvent(trx);
        const driverId = await addPerson(trx, eventId);
        const rideId = await addRide(trx, eventId, driverId, { leg: "retour" });
        await place(trx, eventId, personId, "aller", rideId);
      }, "placement_ride_fk");
    });

    it("refuses a ride of another event", async () => {
      await expectRefusedBy(async (trx) => {
        const { eventId, personId } = await anEvent(trx);
        const other = await anEvent(trx);
        const rideId = await addRide(trx, other.eventId, other.personId);
        await place(trx, eventId, personId, "aller", rideId);
      }, "placement_ride_fk");
    });

    it("refuses a person of another event", async () => {
      await expectRefusedBy(async (trx) => {
        const { eventId } = await anEvent(trx);
        const other = await anEvent(trx);
        await place(trx, eventId, other.personId, "aller", null);
      }, "placement_person_fk");
    });

    it("refuses an event that does not exist", async () => {
      await expectRefusedBy(async (trx) => {
        const { personId } = await anEvent(trx);
        await place(trx, "Zz9zZz9z", personId, "aller", null);
      }, "placement_event_fk");
    });
  });

  // C12.8, by direct writes: what the actions do must not be the only guard.
  describe("a driver has no placement on the leg she drives", () => {
    it.each([
      ["in her own car", true],
      ["without a car", false],
    ])("refuses her placement %s", async (_, inHerCar) => {
      await expect(
        withRollback(async (trx) => {
          const { eventId, personId } = await anEvent(trx);
          const rideId = await addRide(trx, eventId, personId);
          await place(trx, eventId, personId, "aller", inHerCar ? rideId : null);
        }),
      ).rejects.toMatchObject({ code: "23514", constraint: "placement_driver_on_leg" });
    });

    it("refuses moving her placement onto the leg she drives", async () => {
      await expect(
        withRollback(async (trx) => {
          const { eventId, personId } = await anEvent(trx);
          await addRide(trx, eventId, personId, { leg: "aller" });
          await place(trx, eventId, personId, "retour", null);
          await trx.updateTable("placement").set({ leg: "aller" }).where("person_id", "=", personId).execute();
        }),
      ).rejects.toMatchObject({ code: "23514", constraint: "placement_driver_on_leg" });
    });

    it.each([
      ["in a car", true],
      ["without a car", false],
    ])("refuses a ride by a person already placed %s on that leg", async (_, inACar) => {
      await expect(
        withRollback(async (trx) => {
          const { eventId, personId } = await anEvent(trx);
          const otherDriver = await addPerson(trx, eventId);
          const rideId = await addRide(trx, eventId, otherDriver);
          await place(trx, eventId, personId, "aller", inACar ? rideId : null);
          await addRide(trx, eventId, personId, { leg: "aller" });
        }),
      ).rejects.toMatchObject({ code: "23514", constraint: "ride_driver_placed" });
    });

    it("refuses moving her ride onto a leg where she is placed", async () => {
      await expect(
        withRollback(async (trx) => {
          const { eventId, personId } = await anEvent(trx);
          const rideId = await addRide(trx, eventId, personId, { leg: "aller" });
          await place(trx, eventId, personId, "retour", null);
          await trx.updateTable("ride").set({ leg: "retour" }).where("id", "=", rideId).execute();
        }),
      ).rejects.toMatchObject({ code: "23514", constraint: "ride_driver_placed" });
    });

    it("accepts both on the other leg, in either order", async () => {
      const counts = await withRollback(async (trx) => {
        const { eventId, personId: drivesAller } = await anEvent(trx);
        const drivesRetour = await addPerson(trx, eventId);
        const otherDriver = await addPerson(trx, eventId);
        const retourRide = await addRide(trx, eventId, otherDriver, { leg: "retour" });

        await addRide(trx, eventId, drivesAller, { leg: "aller" });
        await place(trx, eventId, drivesAller, "retour", retourRide);

        await place(trx, eventId, drivesRetour, "aller", null);
        await addRide(trx, eventId, drivesRetour, { leg: "retour", location: "Gymnase" });

        return {
          rides: (await trx.selectFrom("ride").select("id").where("event_id", "=", eventId).execute()).length,
          placements: (await trx.selectFrom("placement").select("leg").where("event_id", "=", eventId).execute())
            .length,
        };
      });
      expect(counts).toEqual({ rides: 3, placements: 2 });
    });
  });

  // C12.9
  describe("deleting", () => {
    it("the event empties the three tables of its rows", async () => {
      const left = await withRollback(async (trx) => {
        const { eventId, personId } = await anEvent(trx);
        const passengerId = await addPerson(trx, eventId);
        const rideId = await addRide(trx, eventId, personId);
        await place(trx, eventId, passengerId, "aller", rideId);
        await place(trx, eventId, passengerId, "retour", null);
        await trx.deleteFrom("event").where("id", "=", eventId).execute();
        return Promise.all(
          (["person", "ride", "placement"] as const).map(async (table) =>
            (await trx.selectFrom(table).select("event_id").where("event_id", "=", eventId).execute()).length,
          ),
        );
      });
      expect(left).toEqual([0, 0, 0]);
    });

    it("a ride leaves its passengers without a car, on the same leg and event", async () => {
      const rows = await withRollback(async (trx) => {
        const { eventId, personId } = await anEvent(trx);
        const passengerId = await addPerson(trx, eventId);
        const rideId = await addRide(trx, eventId, personId);
        await place(trx, eventId, passengerId, "aller", rideId);
        await trx.deleteFrom("ride").where("id", "=", rideId).execute();
        return {
          eventId,
          passengerId,
          rows: await trx
            .selectFrom("placement")
            .select(["person_id", "event_id", "leg", "ride_id"])
            .where("event_id", "=", eventId)
            .execute(),
        };
      });
      expect(rows.rows).toEqual([
        { person_id: rows.passengerId, event_id: rows.eventId, leg: "aller", ride_id: null },
      ]);
    });

    it("a person takes her cars and her placements, and her passengers are left without a car", async () => {
      const rows = await withRollback(async (trx) => {
        const { eventId, personId: driverId } = await anEvent(trx);
        const passengerId = await addPerson(trx, eventId);
        const otherDriver = await addPerson(trx, eventId);
        const aller = await addRide(trx, eventId, driverId, { leg: "aller" });
        const retour = await addRide(trx, eventId, otherDriver, { leg: "retour" });
        await place(trx, eventId, passengerId, "aller", aller);
        await place(trx, eventId, driverId, "retour", retour);
        await trx.deleteFrom("person").where("id", "=", driverId).execute();
        return {
          passengerId,
          rides: await trx.selectFrom("ride").select("driver_id").where("event_id", "=", eventId).execute(),
          placements: await trx
            .selectFrom("placement")
            .select(["person_id", "leg", "ride_id"])
            .where("event_id", "=", eventId)
            .execute(),
          otherDriver,
        };
      });
      expect(rows.rides).toEqual([{ driver_id: rows.otherDriver }]);
      expect(rows.placements).toEqual([{ person_id: rows.passengerId, leg: "aller", ride_id: null }]);
    });
  });

  // Two sessions, on committed data, since a rolled-back transaction cannot show another
  // one waiting.
  describe("locks, on committed data", () => {
    async function backendPid(trx: ControlledTransaction<Database>) {
      const { rows } = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(trx);
      return rows[0]!.pid;
    }

    /** Resolves once the session `pid` waits for a lock that another one holds. */
    async function waitingForLock(db: Db, pid: number) {
      for (let attempt = 0; attempt < 200; attempt++) {
        const { rows } = await sql<{ wait: string | null }>`
          select wait_event_type as wait from pg_stat_activity where pid = ${pid}`.execute(db);
        if (rows[0]?.wait === "Lock") return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error("the session never waited for a lock");
    }

    /**
     * Rolls back a transaction that may already be committed or rolled back, and gives its
     * connection back to the pool. Kysely throws synchronously on a finished transaction:
     * inside this try, that cannot hide the error the test is about.
     */
    async function release(trx: ControlledTransaction<Database>) {
      try {
        await trx.rollback().execute();
      } catch {
        // Already finished: nothing to give back.
      }
    }

    // C12.8 under READ COMMITTED, the level of the application's writes: a trigger reads
    // only what is committed. The second writer's trigger sees the first write only because
    // its `FOR UPDATE` waits for the Person that the first one locked, then reads again.
    // Without it, the trigger reads before waiting and both writes pass: each order tests
    // the trigger of its second writer.
    it.each([
      ["places her on a leg, then the other makes her its driver", "placement", "ride_driver_placed"],
      ["makes her the driver of a leg, then the other places her on it", "ride", "placement_driver_on_leg"],
    ] as const)("of two sessions at once, one %s: the second is refused", async (_, first, constraint) => {
      await withCommittedEvent(async (db, eventId) => {
        const personId = await addPerson(db, eventId);
        const writes = {
          placement: (trx: Db) => place(trx, eventId, personId, "aller", null),
          ride: (trx: Db) => addRide(trx, eventId, personId, { leg: "aller" }),
        };
        const second = first === "placement" ? "ride" : "placement";

        const one = await db.startTransaction().setIsolationLevel("read committed").execute();
        const other = await db.startTransaction().setIsolationLevel("read committed").execute();
        let outcome: { code?: string; constraint?: string } | "accepted";
        // `one` is released first, so that `other` stops waiting for its lock.
        try {
          await writes[first](one);
          const pid = await backendPid(other);
          const written = writes[second](other).then(
            () => "accepted" as const,
            (error: { code?: string; constraint?: string }) => ({ code: error.code, constraint: error.constraint }),
          );
          await waitingForLock(db, pid);
          await one.commit().execute();
          outcome = await written;
          if (outcome === "accepted") await other.commit().execute();
        } finally {
          await release(one);
          await release(other);
        }

        expect(outcome).toEqual({ code: "23514", constraint });
        const committed = {
          placement: (await db.selectFrom("placement").select("leg").where("person_id", "=", personId).execute())
            .length,
          ride: (await db.selectFrom("ride").select("leg").where("driver_id", "=", personId).execute()).length,
        };
        expect(committed).toEqual({ [first]: 1, [second]: 0 });
      });
    });

    // The lock order is Ride, then Person. A placement in a car whose writer forgot to lock
    // the Ride first must not lock the Person before it.
    it("a placement written without locking its ride first does not deadlock with a seat taker", async () => {
      await withCommittedEvent(async (db, eventId) => {
        const driverId = await addPerson(db, eventId);
        const personId = await addPerson(db, eventId);
        const rideId = await addRide(db, eventId, driverId);

        // `taker` follows the rule and locks the Ride first; `forgetful` does not.
        const taker = await db.startTransaction().execute();
        const forgetful = await db.startTransaction().execute();
        // `finally`, not `catch`: the error that failed the test is the one reported.
        // `taker` first, so that `forgetful` stops waiting for its lock.
        try {
          await sql`select 1 from ride where id = ${rideId} for update`.execute(taker);
          const pid = await backendPid(forgetful);
          const placed = place(forgetful, eventId, personId, "aller", rideId);
          placed.catch(() => {});
          await waitingForLock(db, pid);

          // The taker now locks the same Person: if `forgetful` held it, each would wait
          // for the other.
          await place(taker, eventId, personId, "retour", null);
          await taker.commit().execute();
          await placed;
          await forgetful.commit().execute();
        } finally {
          await release(taker);
          await release(forgetful);
        }

        const placements = await db
          .selectFrom("placement")
          .select(["leg", "ride_id"])
          .where("event_id", "=", eventId)
          .orderBy("leg")
          .execute();
        expect(placements).toEqual([
          { leg: "aller", ride_id: rideId },
          { leg: "retour", ride_id: null },
        ]);
      });
    });
  });
});
