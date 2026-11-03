import { sql, type Kysely } from "kysely";

// A migration is frozen once deployed: the limits are written here rather than imported
// from the domain, so that changing a domain constant never rewrites a past migration.
// The database is UTF-8: char_length counts code points, as the domain does.
//
// The Stops of a Ride on the aller, and the Stop where a passenger boards (epic #881, #883).
// An expansion: a new table, and a nullable column without default on placement, which the
// deployed code neither reads nor writes (its selects list their columns).
//
// A Stop holds a place, a time, a position and a rank in its Ride: nothing of a person. The
// id is drawn by the browser, like a Ride's, so that a resent request hits the same key.
// The position follows 0003: both coordinates or neither, within the bounds.
//
// At most 6 Stops in a Ride: ranks 0 to 5, unique in the Ride. The uniqueness is deferred,
// so that a reordering written as several updates does not collide with itself.

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("stop")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("event_id", "text", (col) => col.notNull())
    .addColumn("ride_id", "uuid", (col) => col.notNull())
    .addColumn("leg", "text", (col) => col.notNull())
    .addColumn("location", "text", (col) => col.notNull())
    .addColumn("location_lat", "double precision")
    .addColumn("location_lng", "double precision")
    .addColumn("stop_time", "time(0)", (col) => col.notNull())
    .addColumn("rank", "smallint", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    // A Stop belongs to its Ride, which is on the aller and in the same event.
    .addForeignKeyConstraint(
      "stop_ride_fk",
      ["ride_id", "event_id", "leg"],
      "ride",
      ["id", "event_id", "leg"],
      (fk) => fk.onDelete("cascade"),
    )
    // The rule of the purge: an event deleted takes its Stops, whatever the path.
    .addForeignKeyConstraint("stop_event_fk", ["event_id"], "event", ["id"], (fk) =>
      fk.onDelete("cascade"),
    )
    .addCheckConstraint("stop_leg", sql`leg = 'aller'`)
    .addCheckConstraint("stop_location_length", sql`char_length(location) between 1 and 120`)
    .addCheckConstraint("stop_location_position_pair", sql`(location_lat is null) = (location_lng is null)`)
    .addCheckConstraint("stop_location_lat_range", sql`location_lat between -90 and 90`)
    .addCheckConstraint("stop_location_lng_range", sql`location_lng between -180 and 180`)
    .addCheckConstraint("stop_rank_range", sql`rank between 0 and 5`)
    .execute();
  // Kysely's builder cannot write DEFERRABLE.
  await sql`
    alter table stop add constraint stop_ride_rank_unique
      unique (ride_id, rank) deferrable initially deferred`.execute(db);
  // The index of the composite key leads with its three columns, as the foreign key index test
  // asks, and serves a lookup by ride_id alone as well.
  await db.schema.createIndex("stop_ride_idx").on("stop").columns(["ride_id", "event_id", "leg"]).execute();
  await db.schema.createIndex("stop_event_idx").on("stop").column("event_id").execute();

  await db.schema.alterTable("placement").addColumn("stop_id", "uuid").execute();
  // A Stop deleted leaves its passengers in the Ride, boarding at its start.
  await db.schema
    .alterTable("placement")
    .addForeignKeyConstraint("placement_stop_fk", ["stop_id"], "stop", ["id"], (fk) =>
      fk.onDelete("set null"),
    )
    .execute();
  await db.schema.createIndex("placement_stop_idx").on("placement").column("stop_id").execute();
  await db.schema
    .alterTable("placement")
    .addCheckConstraint("placement_stop_in_car", sql`stop_id is null or ride_id is not null`)
    .execute();

  // A composite key (stop_id, ride_id) is not used: with the SET NULL (ride_id) of
  // placement_ride_fk, the order in which Postgres runs the two key actions would decide
  // whether stop_id stays on a Stop that is gone. This trigger makes that order irrelevant:
  // (a) a Ride changed without a new Stop leaves the Stop behind, whoever wrote it, a deleted
  // Ride's key action included; (b) a Stop that is not one of the Ride's is refused. With no
  // Ride, (b) leaves the refusal to placement_stop_in_car. It locks nothing: a Stop is written
  // under the lock of its Ride, which the writer of a Placement already holds.
  await sql`
    create function placement_stop_on_ride() returns trigger language plpgsql as $$
    begin
      if tg_op = 'UPDATE' and new.ride_id is distinct from old.ride_id
         and new.stop_id is not distinct from old.stop_id then
        new.stop_id := null;
      end if;
      if new.stop_id is not null and new.ride_id is not null
         and not exists (select 1 from stop where id = new.stop_id and ride_id = new.ride_id) then
        raise exception 'a boarding stop is a stop of the ride'
          using errcode = 'check_violation', constraint = 'placement_stop_on_ride',
                table = 'placement';
      end if;
      return new;
    end
    $$`.execute(db);
  await sql`
    create trigger placement_stop_on_ride
      before insert or update of ride_id, stop_id on placement
      for each row execute function placement_stop_on_ride()`.execute(db);
}

/**
 * The trigger and its function, then the column (which takes its key, index and check with
 * it), then the table.
 */
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop trigger placement_stop_on_ride on placement`.execute(db);
  await sql`drop function placement_stop_on_ride()`.execute(db);
  await db.schema.alterTable("placement").dropColumn("stop_id").execute();
  await db.schema.dropTable("stop").execute();
}
