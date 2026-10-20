import type { Kysely } from "kysely";
import { hashAdminToken, newAdminToken } from "@/domain/admin-token";
import type { NewEvent } from "@/domain/event";
import { insertEvent } from "./events";
import { deleteLegRows } from "./legs";
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
 * with a new token and a drawn id unless the test needs given ones.
 */
export async function seedEvent(
  db: Kysely<Database>,
  fields: Partial<NewEvent> = {},
  token: string = newAdminToken(),
  newId?: () => string,
): Promise<SeededEvent> {
  const id = await insertEvent(db, { ...SEED, ...fields }, hashAdminToken(token), newId);
  return { id, token };
}

/** The retour removed by the organiser: its Rides and Placements deleted, then `retour_at` null. */
export async function removeSeededRetour(db: Kysely<Database>, eventId: string): Promise<void> {
  await deleteLegRows(db, eventId, "retour");
  await db.updateTable("event").set({ retour_at: null }).where("id", "=", eventId).execute();
}
