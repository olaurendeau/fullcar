import type { ExpressionBuilder, Kysely } from "kysely";
import type { Leg } from "@/domain/leg";
import type { MyEventRow } from "@/domain/my-events";
import type { Database } from "./schema";

/*
 * « Mes événements » in the database (epic #581, OA6.1–OA6.4): an account's events, each
 * with its own fields and numbers only (and, from #949, the address a handover waits on:
 * the account's own events are all it reads). No person, no ride, no first name and no phone
 * leaves this query: what persons and Placements give is counted in SQL. Which of these
 * events the session may see, and in which section, is src/domain/my-events.ts's.
 */

type EventScope = ExpressionBuilder<Database, "event">;

/** The persons signed up for the event. */
function personsOf(eb: EventScope) {
  return eb
    .selectFrom("person")
    .select((sub) => sub.fn.countAll<string>().as("count"))
    .whereRef("person.event_id", "=", "event.id")
    .as("persons");
}

/** The persons without a car on `leg`: their Placement on the leg has no Ride (glossary: Placement). */
function withoutCarOn(eb: EventScope, leg: Leg) {
  return eb
    .selectFrom("placement")
    .select((sub) => sub.fn.countAll<string>().as("count"))
    .whereRef("placement.event_id", "=", "event.id")
    .where("placement.leg", "=", leg)
    .where("placement.ride_id", "is", null)
    .as(`${leg}_without_car`);
}

/**
 * The events whose confirmed organiser is the account `accountId`, in no particular order.
 * A pending event has no account (event_account_confirmed), so none is read (OA2.3).
 */
export async function readMyEventRows(db: Kysely<Database>, accountId: string): Promise<MyEventRow[]> {
  const rows = await db
    .selectFrom("event")
    .select((eb) => [
      "event.id",
      "event.title",
      "event.location",
      "event.aller_at",
      "event.retour_at",
      "event.account_id",
      "event.confirmed_at",
      "event.anonymised_at",
      "event.transfer_email",
      personsOf(eb),
      withoutCarOn(eb, "aller"),
      withoutCarOn(eb, "retour"),
    ])
    .where("event.account_id", "=", accountId)
    .execute();
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    location: row.location,
    allerAt: row.aller_at,
    retourAt: row.retour_at,
    accountId: row.account_id,
    confirmed: row.confirmed_at !== null,
    anonymised: row.anonymised_at !== null,
    persons: Number(row.persons ?? 0),
    withoutCar: { aller: Number(row.aller_without_car ?? 0), retour: Number(row.retour_without_car ?? 0) },
    transferEmail: row.transfer_email,
  }));
}
