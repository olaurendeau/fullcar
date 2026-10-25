import type { Migration } from "kysely/migration";
import * as event from "./0001_event";
import * as participants from "./0002_participants";
import * as positions from "./0003_positions";
import * as accounts from "./0004_accounts";

/**
 * Every migration, in order. Listed statically rather than read from the folder,
 * so the same list works under tsx, Vitest and a bundled serverless function.
 * Each one must have a `down`: the migration test runs it.
 */
export const migrations: Record<string, Migration> = {
  "0001_event": event,
  "0002_participants": participants,
  "0003_positions": positions,
  "0004_accounts": accounts,
};
