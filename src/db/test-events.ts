import { randomUUID } from "node:crypto";
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
  locationPosition: null,
  description: null,
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

/**
 * The event confirmed by a new account of its own, as a used confirmation link leaves it.
 * Gives the account's id. The address is drawn: a concurrency test may commit accounts too.
 */
export async function confirmSeededEvent(db: Kysely<Database>, eventId: string): Promise<string> {
  const { id } = await db
    .insertInto("account")
    .values({ email: `camille-${randomUUID()}@exemple.fr`, locale: "fr" })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db.updateTable("event").set({ account_id: id, confirmed_at: new Date() }).where("id", "=", eventId).execute();
  return id;
}
