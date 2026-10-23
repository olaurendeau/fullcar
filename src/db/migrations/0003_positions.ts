import { sql, type Kysely } from "kysely";

// A migration is frozen once deployed: the bounds are written here rather than imported
// from the domain, so that changing a domain constant never rewrites a past migration.
//
// D4: the position of a place, stored only once a suggestion has been chosen. An expansion:
// nullable columns without default, which the deployed code neither reads nor writes (its
// selects list their columns). The rounding to 5 decimals is the domain's: comparing a
// double precision with its round(…, 5) would refuse values the domain has rounded.

const TABLES = ["event", "ride"] as const;

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const table of TABLES) {
    await db.schema
      .alterTable(table)
      .addColumn("location_lat", "double precision")
      .addColumn("location_lng", "double precision")
      .execute();
    await db.schema
      .alterTable(table)
      .addCheckConstraint(
        `${table}_location_position_pair`,
        sql`(location_lat is null) = (location_lng is null)`,
      )
      .execute();
    await db.schema
      .alterTable(table)
      .addCheckConstraint(`${table}_location_lat_range`, sql`location_lat between -90 and 90`)
      .execute();
    await db.schema
      .alterTable(table)
      .addCheckConstraint(`${table}_location_lng_range`, sql`location_lng between -180 and 180`)
      .execute();
  }
}

/** Dropping the columns drops the constraints on them. */
export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of [...TABLES].reverse()) {
    await db.schema.alterTable(table).dropColumn("location_lat").dropColumn("location_lng").execute();
  }
}
