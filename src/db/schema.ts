import type { ColumnType, Generated } from "kysely";

/** Tables as Kysely sees them. Grows with each migration. */
export interface Database {
  event: EventTable;
  person: PersonTable;
  ride: RideTable;
  placement: PlacementTable;
  account: AccountTable;
  session: SessionTable;
  email_link: EmailLinkTable;
  email_send: EmailSendTable;
}

/**
 * The result of the confirmation email sent at creation (OA1.7), kept with the pending
 * event: `address_limit` when the per-address limit or the global cap stopped it.
 */
export type SendStatusColumn = "sending" | "sent" | "failed" | "address_limit";

/**
 * `aller_at` and `retour_at` are wall-clock times at the event's place, without time
 * zone: written and read as `YYYY-MM-DD HH:MM:SS` strings, never as a Date.
 * `admin_token_hash` is the 32-byte SHA-256 of the admin token, never the token itself;
 * null once the token is revoked (#586), and then no token matches it. A new event always
 * has one: only an update writes null.
 * `location_lat` and `location_lng` are the position of `location`: both or neither.
 * From #586 (epic #581): `account_id` is the confirmed organiser's account, null while
 * the event is pending or once its account is deleted; `pending_email` is the address
 * awaiting confirmation, null once confirmed; `send_status` and `send_status_at` are the
 * last result of the confirmation email, both or neither; `anonymised_at` is the day 30
 * of an event with an account, after which it has no token and no position.
 */
export interface EventTable {
  id: string;
  title: string;
  location: string;
  aller_at: string;
  retour_at: string | null;
  boosters_enabled: Generated<boolean>;
  participation_enabled: Generated<boolean>;
  stops_enabled: Generated<boolean>;
  admin_token_hash: ColumnType<Buffer | null, Buffer, Buffer | null>;
  created_at: ColumnType<Date, never, never>;
  location_lat: number | null;
  location_lng: number | null;
  account_id: string | null;
  confirmed_at: Date | null;
  pending_email: string | null;
  send_status: SendStatusColumn | null;
  send_status_at: Date | null;
  anonymised_at: Date | null;
}

/** The two legs of an Event, as stored: `retour` only when the event has one. */
type LegColumn = "aller" | "retour";

/**
 * `id` is drawn by the browser, and doubles as the creation id of a resent request.
 * `token_hash` is the 32-byte SHA-256 of the personal token, never the token itself.
 */
export interface PersonTable {
  id: string;
  event_id: string;
  first_name: string;
  phone: string | null;
  token_hash: Buffer;
  created_at: ColumnType<Date, never, never>;
}

/**
 * `departure_time` is a wall-clock `HH:MM:SS` string on the date of its leg, which is not
 * stored. `id` is drawn by the browser, like a person's. `location_lat` and
 * `location_lng` are the position of `location`, as on an event.
 */
export interface RideTable {
  id: string;
  event_id: string;
  leg: LegColumn;
  driver_id: string;
  location: string;
  departure_time: string;
  seats: number;
  note: string | null;
  created_at: ColumnType<Date, never, never>;
  location_lat: number | null;
  location_lng: number | null;
}

/**
 * One per person and leg. `ride_id` null: the person is without a car on that leg.
 * `placed_at` gives the boarding order: set by the database on insert. Its update type
 * lets the code write it, as a Date too; src/db/placements.ts only ever sets it back to the
 * database's `now()`, when `ride_id` changes.
 */
export interface PlacementTable {
  person_id: string;
  event_id: string;
  leg: LegColumn;
  ride_id: string | null;
  placed_at: ColumnType<Date, never, Date>;
}

/** What a link from an email opens, as the domain's `LinkKind`. */
type LinkKindColumn = "login" | "confirmation";

/** What a send counts in: a confirmation email, or the answer to a sign-in request. */
type SendKindColumn = "confirmation" | "login";

/**
 * An organiser (epic #581). `email` is written as src/domain/email-address.ts reads it:
 * trimmed, lowercased, in NFC; one address, one account. `locale` and `last_visit_at` are
 * those of the last visit with a session, which measures inactivity (OA9.7); `warned_at`
 * is when the inactivity warning went out. The id is drawn by the database. A seeded test
 * may write the visit in the past.
 */
export interface AccountTable {
  id: Generated<string>;
  email: string;
  locale: "fr" | "en";
  created_at: ColumnType<Date, never, never>;
  last_visit_at: ColumnType<Date, Date | undefined, Date>;
  warned_at: Date | null;
}

/**
 * A session, keyed by the 32-byte SHA-256 of its token, never the token itself. It lives
 * 90 days after `last_visit_at`. A seeded test may write both dates in the past.
 */
export interface SessionTable {
  token_hash: Buffer;
  account_id: string;
  created_at: ColumnType<Date, Date | undefined, never>;
  last_visit_at: ColumnType<Date, Date | undefined, Date>;
}

/**
 * A link sent by email, keyed by the 32-byte SHA-256 of its token. A sign-in link has an
 * account, a confirmation link an event, never both. `used_at` is written once: a link
 * serves once. A seeded test may write `created_at` in the past, to expire it.
 *
 * A confirmation link keeps no address: it confirms its event's `pending_email`. So
 * OA2.5 holds only because « Corriger l'adresse » deletes the event's confirmation links
 * in the same transaction as it writes the new address: a link left behind would
 * confirm the new address with a link sent to the old one.
 *
 * `return_event_id` is where a sign-in link lands (OA4.4): `/e/{id}/admin` of that
 * event, or `/mes-evenements` when null, the event deleted since included. A confirmation
 * link has none: it lands on its own event (OA5.3).
 */
export interface EmailLinkTable {
  token_hash: Buffer;
  kind: LinkKindColumn;
  account_id: string | null;
  event_id: string | null;
  created_at: ColumnType<Date, Date | undefined, never>;
  used_at: Date | null;
  return_event_id: string | null;
}

/**
 * An email we tried to send, for the limits (src/domain/send-limits.ts). `email` is the
 * address, written as an account's is. `event_id` is the event of a confirmation email,
 * null for the answer to a sign-in request, and null again once the event is gone: the
 * send still counts for its address and in the global cap. The id is drawn by the database.
 */
export interface EmailSendTable {
  id: Generated<string>;
  kind: SendKindColumn;
  email: string;
  event_id: string | null;
  sent_at: ColumnType<Date, Date | undefined, never>;
}
