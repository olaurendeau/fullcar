import type { ColumnType, Generated } from "kysely";

/** Tables as Kysely sees them. Grows with each migration. */
export interface Database {
  event: EventTable;
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
