import type { ColumnType, Generated } from "kysely";

/** Tables as Kysely sees them. Grows with each migration. */
export interface Database {
  event: EventTable;
  person: PersonTable;
  ride: RideTable;
  placement: PlacementTable;
}

/**
 * `aller_at` and `retour_at` are wall-clock times at the event's place, without time
 * zone: written and read as `YYYY-MM-DD HH:MM:SS` strings, never as a Date.
 * `admin_token_hash` is the 32-byte SHA-256 of the admin token, never the token itself.
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
  admin_token_hash: Buffer;
  created_at: ColumnType<Date, never, never>;
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
 * stored. `id` is drawn by the browser, like a person's.
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
}

/**
 * One per person and leg. `ride_id` null: the person is without a car on that leg.
 * `placed_at` gives the boarding order: set by the database on insert, and set back to its
 * `now()` when `ride_id` changes (src/db/placements.ts), never to a time from the app.
 */
export interface PlacementTable {
  person_id: string;
  event_id: string;
  leg: LegColumn;
  ride_id: string | null;
  placed_at: ColumnType<Date, never, Date>;
}
