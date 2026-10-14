import type { Kysely } from "kysely";
import { hashAdminToken, newAdminToken } from "@/domain/admin-token";
import type { NewEvent } from "@/domain/event";
import { insertEvent } from "./events";
import type { Database } from "./schema";

const SEED: NewEvent = {
  title: "Tournoi de Rennes",
  location: "Gymnase des Gayeulles",
  allerAt: "2026-12-12 07:30:00",
  retourAt: "2026-12-12 18:00:00",
  boostersEnabled: false,
  participationEnabled: false,
  stopsEnabled: false,
};

export interface SeededEvent {
  id: string;
  /** The organiser's token, for tests only: the database keeps its hash. */
  token: string;
}

/**
 * Stores an event, aller and retour without options unless `fields` says otherwise,
 * with a new token unless the test needs a given one.
 */
export async function seedEvent(
  db: Kysely<Database>,
  fields: Partial<NewEvent> = {},
  token: string = newAdminToken(),
): Promise<SeededEvent> {
  const id = await insertEvent(db, { ...SEED, ...fields }, hashAdminToken(token));
  return { id, token };
}
