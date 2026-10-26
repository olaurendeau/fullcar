import { sql, type Kysely } from "kysely";

// A migration is frozen once deployed: the limit is written here rather than imported
// from the domain, so that changing a domain constant never rewrites a past migration.
// The database is UTF-8: char_length counts code points, as the domain does.
//
// The event's description (epic #654, #706). An expansion: a nullable column without
// default, which the deployed code neither reads nor writes (its selects list their
// columns). No description is null, never an empty text.

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("event").addColumn("description", "text").execute();
  await db.schema
    .alterTable("event")
    .addCheckConstraint("event_description_length", sql`char_length(description) between 1 and 1000`)
    .execute();
}

/** Dropping the column drops the constraint on it. */
export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("event").dropColumn("description").execute();
}
