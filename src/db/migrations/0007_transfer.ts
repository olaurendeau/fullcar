import { sql, type Kysely, type RawBuilder } from "kysely";

// A migration is frozen once deployed: the limits are written here rather than imported
// from the domain, so that changing a domain constant never rewrites a past migration.
// The database is UTF-8: char_length counts code points, as the domain does.
//
// Handing an event over to another organiser (epic #935, #940). An expansion: three
// nullable columns on event without default, which the deployed code neither reads nor
// writes (its selects list their columns), and four checks that accept one more kind. The
// deployed code never writes that kind.
//
// The address a handover waits on is kept as pending_email is (0004): trimmed, lowercased,
// in NFC, 1 to 254 code points. Its status is the send status of the confirmation email
// (sending, sent, failed, address_limit), and the three columns are null together.
//
// OT5.1 to OT5.3, in the database: a handover waits only on an event that has an account,
// confirmed, not anonymised. An event that is pending, orphaned or anonymised cannot carry
// one, so whatever erases an account or anonymises an event must erase the handover first.
//
// A handover link goes with its event, as a confirmation link does: it has an event and
// neither an account nor an event to return to. A handover email is counted with its event,
// as a confirmation email is.

const ADDRESS = sql.ref("transfer_email");

const LINK_KINDS_0004 = sql`kind in ('login', 'confirmation')`;
const LINK_TARGET_0004 = sql`(kind = 'login' and account_id is not null and event_id is null)
  or (kind = 'confirmation' and event_id is not null and account_id is null
      and return_event_id is null)`;
const SEND_KINDS_0004 = sql`kind in ('confirmation', 'login')`;
const SEND_EVENT_0004 = sql`kind = 'confirmation' or event_id is null`;

const LINK_KINDS = sql`kind in ('login', 'confirmation', 'transfer')`;
const LINK_TARGET = sql`(kind = 'login' and account_id is not null and event_id is null)
  or (kind in ('confirmation', 'transfer') and event_id is not null and account_id is null
      and return_event_id is null)`;
const SEND_KINDS = sql`kind in ('confirmation', 'login', 'transfer')`;
const SEND_EVENT = sql`kind in ('confirmation', 'transfer') or event_id is null`;

const EVENT_CHECKS = {
  event_transfer_email_length: sql`char_length(${ADDRESS}) between 1 and 254`,
  event_transfer_email_normalised: sql`${ADDRESS} = normalize(lower(btrim(${ADDRESS}) collate pg_c_utf8), nfc)`,
  event_transfer_status: sql`transfer_status in ('sending', 'sent', 'failed', 'address_limit')`,
  event_transfer_trio: sql`(transfer_email is null) = (transfer_status is null)
    and (transfer_email is null) = (transfer_status_at is null)`,
  event_transfer_open: sql`transfer_email is null
    or (account_id is not null and confirmed_at is not null and anonymised_at is null)`,
};

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("event")
    .addColumn("transfer_email", "text")
    .addColumn("transfer_status", "text")
    .addColumn("transfer_status_at", "timestamptz")
    .execute();
  for (const [name, check] of Object.entries(EVENT_CHECKS)) {
    await db.schema.alterTable("event").addCheckConstraint(name, check).execute();
  }

  await replaceChecks(db, "email_link", { email_link_kind: LINK_KINDS, email_link_target: LINK_TARGET });
  await replaceChecks(db, "email_send", { email_send_kind: SEND_KINDS, email_send_event_kind: SEND_EVENT });
}

/**
 * A handover waiting is lost, with its links and its sends: 0004 knows no such kind, so
 * the old checks would refuse the rows. The checks go back as 0004 wrote them, then the
 * columns, after their own checks.
 */
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`delete from email_link where kind = 'transfer'`.execute(db);
  await sql`delete from email_send where kind = 'transfer'`.execute(db);
  await replaceChecks(db, "email_send", { email_send_kind: SEND_KINDS_0004, email_send_event_kind: SEND_EVENT_0004 });
  await replaceChecks(db, "email_link", { email_link_kind: LINK_KINDS_0004, email_link_target: LINK_TARGET_0004 });

  for (const name of Object.keys(EVENT_CHECKS)) {
    await db.schema.alterTable("event").dropConstraint(name).execute();
  }
  await db.schema
    .alterTable("event")
    .dropColumn("transfer_status_at")
    .dropColumn("transfer_status")
    .dropColumn("transfer_email")
    .execute();
}

async function replaceChecks(
  db: Kysely<unknown>,
  table: "email_link" | "email_send",
  checks: Record<string, RawBuilder<unknown>>,
): Promise<void> {
  for (const name of Object.keys(checks)) {
    await db.schema.alterTable(table).dropConstraint(name).execute();
  }
  for (const [name, check] of Object.entries(checks)) {
    await db.schema.alterTable(table).addCheckConstraint(name, check).execute();
  }
}
