import { sql, type Kysely } from "kysely";

// A migration is frozen once deployed: the limits are written here rather than imported
// from the domain, so that changing a domain constant never rewrites a past migration.
// The database is UTF-8: char_length counts code points, as the domain does.
//
// The organiser's account (epic #581, design on #581). An expansion: new tables, and
// nullable columns on event without default, which the deployed code neither reads nor
// writes (its selects list their columns). admin_token_hash may now be null, which the
// deployed code never writes: a revoked token, which no token matches.
//
// An address is stored as src/domain/email-address.ts reads it: trimmed, lowercased, in
// NFC, 254 code points at most. One address is one account, so the check refuses any
// other writing. pg_c_utf8 (Postgres 17 or later) lowercases by Unicode, whatever the
// database's locale: an address the domain wrote is already lowercase, and passes.
//
// The foreign keys follow the table of docs/agents/architecture.md. A session or a
// sign-in link goes with its account, a confirmation link with its event. An event
// outlives its account (OA9.5), and a send its event: it still counts for its address
// and in the global cap.

const ADDRESS_COLUMNS = [
  ["account", "email"],
  ["email_send", "email"],
  ["event", "pending_email"],
] as const;

function addressLength(column: string) {
  return sql`char_length(${sql.ref(column)}) between 1 and 254`;
}

function addressNormalised(column: string) {
  const ref = sql.ref(column);
  return sql`${ref} = normalize(lower(btrim(${ref}) collate pg_c_utf8), nfc)`;
}

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("account")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("email", "text", (col) => col.notNull())
    .addColumn("locale", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("last_visit_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("warned_at", "timestamptz")
    .addUniqueConstraint("account_email_unique", ["email"])
    .addCheckConstraint("account_locale", sql`locale in ('fr', 'en')`)
    .execute();

  await db.schema
    .createTable("session")
    .addColumn("token_hash", "bytea", (col) => col.primaryKey())
    .addColumn("account_id", "uuid", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("last_visit_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addForeignKeyConstraint("session_account_fk", ["account_id"], "account", ["id"], (fk) =>
      fk.onDelete("cascade"),
    )
    .addCheckConstraint("session_token_hash_length", sql`octet_length(token_hash) = 32`)
    .execute();
  await db.schema.createIndex("session_account_idx").on("session").column("account_id").execute();

  await db.schema
    .createTable("email_link")
    .addColumn("token_hash", "bytea", (col) => col.primaryKey())
    .addColumn("kind", "text", (col) => col.notNull())
    .addColumn("account_id", "uuid")
    .addColumn("event_id", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("used_at", "timestamptz")
    .addColumn("return_event_id", "text")
    .addForeignKeyConstraint("email_link_account_fk", ["account_id"], "account", ["id"], (fk) =>
      fk.onDelete("cascade"),
    )
    .addForeignKeyConstraint("email_link_event_fk", ["event_id"], "event", ["id"], (fk) =>
      fk.onDelete("cascade"),
    )
    // OA4.4: the page a sign-in was asked from, /e/{id}/admin; without it, /mes-evenements.
    // An event gone leaves the link working, back to /mes-evenements.
    .addForeignKeyConstraint("email_link_return_event_fk", ["return_event_id"], "event", ["id"], (fk) =>
      fk.onDelete("set null"),
    )
    .addCheckConstraint("email_link_kind", sql`kind in ('login', 'confirmation')`)
    // A sign-in link opens a session on its account, and may return to an event; a
    // confirmation link attaches only its own event, to the account of the event's
    // pending address, and lands on that event.
    .addCheckConstraint(
      "email_link_target",
      sql`(kind = 'login' and account_id is not null and event_id is null)
       or (kind = 'confirmation' and event_id is not null and account_id is null
           and return_event_id is null)`,
    )
    .addCheckConstraint("email_link_token_hash_length", sql`octet_length(token_hash) = 32`)
    .execute();
  await db.schema.createIndex("email_link_account_idx").on("email_link").column("account_id").execute();
  await db.schema.createIndex("email_link_event_idx").on("email_link").column("event_id").execute();
  await db.schema
    .createIndex("email_link_return_event_idx")
    .on("email_link")
    .column("return_event_id")
    .execute();

  await db.schema
    .createTable("email_send")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("kind", "text", (col) => col.notNull())
    .addColumn("email", "text", (col) => col.notNull())
    .addColumn("event_id", "text")
    .addColumn("sent_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addForeignKeyConstraint("email_send_event_fk", ["event_id"], "event", ["id"], (fk) =>
      fk.onDelete("set null"),
    )
    .addCheckConstraint("email_send_kind", sql`kind in ('confirmation', 'login')`)
    // A confirmation email loses its event when the event is deleted, and stays counted.
    .addCheckConstraint("email_send_event_kind", sql`kind = 'confirmation' or event_id is null`)
    .execute();
  // The limits count by address, by event and overall, over the last hour.
  await db.schema.createIndex("email_send_email_idx").on("email_send").columns(["email", "sent_at"]).execute();
  await db.schema.createIndex("email_send_event_idx").on("email_send").column("event_id").execute();
  await db.schema.createIndex("email_send_sent_idx").on("email_send").column("sent_at").execute();

  await db.schema
    .alterTable("event")
    .addColumn("account_id", "uuid", (col) => col.references("account.id").onDelete("set null"))
    .addColumn("confirmed_at", "timestamptz")
    .addColumn("pending_email", "text")
    .addColumn("send_status", "text")
    .addColumn("send_status_at", "timestamptz")
    .addColumn("anonymised_at", "timestamptz")
    .execute();
  // Kysely names an inline reference by itself: renamed, to be named as the others are.
  await sql`alter table event rename constraint event_account_id_fkey to event_account_fk`.execute(db);
  await db.schema.createIndex("event_account_idx").on("event").column("account_id").execute();
  await db.schema.alterTable("event").alterColumn("admin_token_hash", (col) => col.dropNotNull()).execute();

  for (const [table, column] of ADDRESS_COLUMNS) {
    await db.schema.alterTable(table).addCheckConstraint(`${table}_${column}_length`, addressLength(column)).execute();
    await db.schema
      .alterTable(table)
      .addCheckConstraint(`${table}_${column}_normalised`, addressNormalised(column))
      .execute();
  }

  const eventChecks = {
    event_send_status: sql`send_status in ('sending', 'sent', 'failed', 'address_limit')`,
    event_send_status_pair: sql`(send_status is null) = (send_status_at is null)`,
    event_account_confirmed: sql`account_id is null or confirmed_at is not null`,
    event_confirmed_no_pending: sql`confirmed_at is null or pending_email is null`,
    event_anonymised_bare: sql`anonymised_at is null
      or (admin_token_hash is null and location_lat is null and location_lng is null)`,
  };
  for (const [name, check] of Object.entries(eventChecks)) {
    await db.schema.alterTable("event").addCheckConstraint(name, check).execute();
  }
}

/**
 * Dropping the columns drops the constraints on them. 0003 has no room for an event
 * without a token: it gets the hash of a random value, which no token matches, so the
 * event stays as it was rather than being lost or making the down fail.
 */
export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("email_send").execute();
  await db.schema.dropTable("email_link").execute();
  await db.schema.dropTable("session").execute();
  await db.schema
    .alterTable("event")
    .dropColumn("anonymised_at")
    .dropColumn("send_status_at")
    .dropColumn("send_status")
    .dropColumn("pending_email")
    .dropColumn("confirmed_at")
    .dropColumn("account_id")
    .execute();
  await sql`
    update event set admin_token_hash = sha256(convert_to(gen_random_uuid()::text, 'UTF8'))
    where admin_token_hash is null`.execute(db);
  await db.schema.alterTable("event").alterColumn("admin_token_hash", (col) => col.setNotNull()).execute();
  await db.schema.dropTable("account").execute();
}
