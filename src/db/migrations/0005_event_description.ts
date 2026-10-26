import { sql, type Kysely } from "kysely";

// A migration is frozen once deployed: the limit is written here rather than imported
// from the domain, so that changing a domain constant never rewrites a past migration.
// The database is UTF-8: char_length counts code points, as the domain does.
//
// The event's description (epic #654, #706). An expansion: a nullable column without
// default, which the deployed code neither reads nor writes (its selects list their
// columns). No description is null, never an empty text.
//
// A description may hold personal data: erased on day 30 like the position (design
// event-description v3, decision on #654), so event_anonymised_bare of 0004 now requires
// it too. Every event anonymised before this migration has no description: the new
// check holds on them. 0004's check is written out again here rather than imported, for
// the same reason as the limit.

const ANONYMISED_BARE_0004 = sql`anonymised_at is null
  or (admin_token_hash is null and location_lat is null and location_lng is null)`;

const ANONYMISED_BARE = sql`anonymised_at is null
  or (admin_token_hash is null and location_lat is null and location_lng is null
      and description is null)`;

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("event").addColumn("description", "text").execute();
  await db.schema
    .alterTable("event")
    .addCheckConstraint("event_description_length", sql`char_length(description) between 1 and 1000`)
    .execute();
  await db.schema.alterTable("event").dropConstraint("event_anonymised_bare").execute();
  await db.schema.alterTable("event").addCheckConstraint("event_anonymised_bare", ANONYMISED_BARE).execute();
}

/**
 * Dropping the column would drop event_anonymised_bare with it, since the check names the
 * column: it is dropped first, then put back as 0004 wrote it. 0004's check is weaker, so
 * every event passes it.
 */
export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("event").dropConstraint("event_anonymised_bare").execute();
  await db.schema.alterTable("event").dropColumn("description").execute();
  await db.schema.alterTable("event").addCheckConstraint("event_anonymised_bare", ANONYMISED_BARE_0004).execute();
}
