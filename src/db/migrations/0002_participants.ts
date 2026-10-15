import { sql, type Kysely } from "kysely";

// A migration is frozen once deployed: the limits are written here rather than imported
// from the domain, so that changing a domain constant never rewrites a past migration.
// The database is UTF-8: char_length counts code points, as the domain does.
//
// Every id is a uuid drawn by the browser, without default: it is also the creation id
// that makes a resent creation hit the same key (#66, C12.4). The foreign keys follow the
// table of docs/agents/architecture.md; the composite ones keep a Ride or a Placement
// inside its event, and a Placement on the leg of its Ride (C12.7).

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("person")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("event_id", "text", (col) => col.notNull())
    .addColumn("first_name", "text", (col) => col.notNull())
    .addColumn("phone", "text")
    .addColumn("token_hash", "bytea", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addForeignKeyConstraint("person_event_fk", ["event_id"], "event", ["id"], (fk) =>
      fk.onDelete("cascade"),
    )
    .addUniqueConstraint("person_id_event_unique", ["id", "event_id"])
    .addCheckConstraint("person_first_name_length", sql`char_length(first_name) between 1 and 40`)
    .addCheckConstraint("person_phone_format", sql`phone ~ '^[0-9 +.()-]{1,25}$'`)
    .addCheckConstraint(
      "person_phone_digits",
      sql`char_length(regexp_replace(phone, '[^0-9]', '', 'g')) between 6 and 15`,
    )
    .addCheckConstraint("person_token_hash_length", sql`octet_length(token_hash) = 32`)
    .execute();
  await db.schema.createIndex("person_event_idx").on("person").column("event_id").execute();

  await db.schema
    .createTable("ride")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("event_id", "text", (col) => col.notNull())
    .addColumn("leg", "text", (col) => col.notNull())
    .addColumn("driver_id", "uuid", (col) => col.notNull())
    .addColumn("location", "text", (col) => col.notNull())
    .addColumn("departure_time", "time(0)", (col) => col.notNull())
    .addColumn("seats", "smallint", (col) => col.notNull())
    .addColumn("note", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addForeignKeyConstraint("ride_event_fk", ["event_id"], "event", ["id"], (fk) =>
      fk.onDelete("cascade"),
    )
    // Deleting the driver takes her car; its passengers are then left without a car by
    // the placement → ride key.
    .addForeignKeyConstraint(
      "ride_driver_fk",
      ["driver_id", "event_id"],
      "person",
      ["id", "event_id"],
      (fk) => fk.onDelete("cascade"),
    )
    .addUniqueConstraint("ride_driver_leg_unique", ["driver_id", "leg"])
    .addUniqueConstraint("ride_id_event_leg_unique", ["id", "event_id", "leg"])
    .addCheckConstraint("ride_leg", sql`leg in ('aller', 'retour')`)
    .addCheckConstraint("ride_location_length", sql`char_length(location) between 1 and 120`)
    .addCheckConstraint("ride_seats_range", sql`seats between 1 and 8`)
    .addCheckConstraint("ride_note_length", sql`char_length(note) <= 200`)
    .execute();
  await db.schema.createIndex("ride_event_idx").on("ride").column("event_id").execute();

  await db.schema
    .createTable("placement")
    .addColumn("person_id", "uuid", (col) => col.notNull())
    .addColumn("event_id", "text", (col) => col.notNull())
    .addColumn("leg", "text", (col) => col.notNull())
    .addColumn("ride_id", "uuid")
    .addColumn("placed_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("placement_pkey", ["person_id", "leg"])
    .addForeignKeyConstraint("placement_event_fk", ["event_id"], "event", ["id"], (fk) =>
      fk.onDelete("cascade"),
    )
    .addForeignKeyConstraint(
      "placement_person_fk",
      ["person_id", "event_id"],
      "person",
      ["id", "event_id"],
      (fk) => fk.onDelete("cascade"),
    )
    .addCheckConstraint("placement_leg", sql`leg in ('aller', 'retour')`)
    .execute();
  // A Ride deleted leaves its passengers without a car on that leg: only ride_id goes back
  // to null (Postgres 15 or later), event_id and leg stay. MATCH SIMPLE: a placement
  // without a car is not checked against any ride. Kysely's builder cannot write a column
  // list after SET NULL.
  await sql`
    alter table placement add constraint placement_ride_fk
      foreign key (ride_id, event_id, leg) references ride (id, event_id, leg)
      on delete set null (ride_id)`.execute(db);
  await db.schema.createIndex("placement_event_idx").on("placement").column("event_id").execute();
  await db.schema.createIndex("placement_ride_idx").on("placement").column("ride_id").execute();

  // C12.8: a driver has no placement on the leg she drives. Each trigger first locks the
  // person's row, so that a placement and a ride written at the same time for her, by two
  // transactions under READ COMMITTED (the default), cannot both pass: the second waits,
  // then sees the first. Lock order everywhere: Ride, then Person. A placement in a car
  // takes its Ride first, with the lock its foreign key would take after the trigger
  // anyway: without it, a writer that forgot to lock the Ride would hold the Person, then
  // wait for the Ride, and deadlock with a seat taker holding the Ride.
  await sql`
    create function placement_driver_on_leg() returns trigger language plpgsql as $$
    begin
      if new.ride_id is not null then
        perform 1 from ride where id = new.ride_id for key share;
      end if;
      perform 1 from person where id = new.person_id for update;
      if exists (select 1 from ride where driver_id = new.person_id and leg = new.leg) then
        raise exception 'a driver has no placement on the leg she drives'
          using errcode = 'check_violation', constraint = 'placement_driver_on_leg',
                table = 'placement';
      end if;
      return new;
    end
    $$`.execute(db);
  await sql`
    create trigger placement_driver_on_leg
      before insert or update of person_id, leg on placement
      for each row execute function placement_driver_on_leg()`.execute(db);

  await sql`
    create function ride_driver_placed() returns trigger language plpgsql as $$
    begin
      perform 1 from person where id = new.driver_id for update;
      if exists (select 1 from placement where person_id = new.driver_id and leg = new.leg) then
        raise exception 'a person placed on a leg does not drive on it'
          using errcode = 'check_violation', constraint = 'ride_driver_placed',
                table = 'ride';
      end if;
      return new;
    end
    $$`.execute(db);
  await sql`
    create trigger ride_driver_placed
      before insert or update of driver_id, leg on ride
      for each row execute function ride_driver_placed()`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop trigger ride_driver_placed on ride`.execute(db);
  await sql`drop trigger placement_driver_on_leg on placement`.execute(db);
  await sql`drop function ride_driver_placed()`.execute(db);
  await sql`drop function placement_driver_on_leg()`.execute(db);
  await db.schema.dropTable("placement").execute();
  await db.schema.dropTable("ride").execute();
  await db.schema.dropTable("person").execute();
}
