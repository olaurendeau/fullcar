import { sql, type Kysely } from "kysely";

// A migration is frozen once deployed: the limits are written here rather than imported
// from the domain, so that changing a domain constant never rewrites a past migration.
// The database is UTF-8: char_length counts code points, as the domain does.

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("event")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("location", "text", (col) => col.notNull())
    .addColumn("aller_at", "timestamp(0)", (col) => col.notNull())
    .addColumn("retour_at", "timestamp(0)")
    .addColumn("boosters_enabled", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("participation_enabled", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("stops_enabled", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("admin_token_hash", "bytea", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint("event_id_format", sql`id ~ '^[2-9A-HJ-NP-Za-km-z]{8}$'`)
    .addCheckConstraint("event_title_length", sql`char_length(title) between 1 and 80`)
    .addCheckConstraint("event_location_length", sql`char_length(location) between 1 and 120`)
    .addCheckConstraint("event_retour_after_aller", sql`retour_at is null or retour_at > aller_at`)
    .addCheckConstraint("event_admin_token_hash_length", sql`octet_length(admin_token_hash) = 32`)
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("event").execute();
}
