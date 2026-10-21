import type { Kysely } from "kysely";
import { lockEvent } from "@/db/events";
import { countLegRows, deleteLegRows, type LegCounts } from "@/db/legs";
import type { Database } from "@/db/schema";
import { eventLegs, type Leg } from "@/domain/leg";

/*
 * The retour, and whether it still exists (epic #250, M3.6). Its removal and the writes on
 * it are ordered by the Event's lock: a write holds it shared from its first statement, the
 * removal holds it alone. So a write on the retour has either committed before the removal
 * counts, and changes its numbers, or waits for the removal and finds no retour.
 */

/** Why a write on a leg was not even tried. */
export type LegRefusal = "eventNotFound" | "noRetour";

export type LockedLegs = { ok: true; legs: Leg[] } | { ok: false; error: LegRefusal };

/**
 * The first step of every write on a leg: the Event under `lockEvent(…, "share")`, then
 * whether every leg the write touches exists. `noRetour` comes before any other refusal of the transaction,
 * `rideGone` and `forbidden` included (decision 40): the cause is the retour, not the car.
 * Only a malformed request (`invalid`) comes before it, wherever it is read: before the
 * transaction, or in it after this lock, as `addPerson` and `setPersonLeg` do; and the
 * field errors, read before the transaction. Gives the event's legs.
 */
export async function lockLegs(trx: Kysely<Database>, eventId: string, touched: readonly Leg[]): Promise<LockedLegs> {
  const event = await lockEvent(trx, eventId, "share");
  if (event === undefined) return { ok: false, error: "eventNotFound" };
  const legs = eventLegs(event.retour_at);
  return touched.every((leg) => legs.includes(leg)) ? { ok: true, legs } : { ok: false, error: "noRetour" };
}

/** `confirmRetour`: the retour holds these now, and nothing was deleted. */
export type RetourRemoval = { ok: true } | ({ ok: false; error: "confirmRetour" } & LegCounts);

/**
 * Deletes the retour's Rides and Placements (DE1 = (b)); the persons stay, with their
 * aller. Its numbers are counted again here, and compared with those the organiser
 * `confirmed` (decision 35): the same, or none left, and the retour is emptied; otherwise
 * nothing is deleted, and the numbers now come back for a new confirmation. An exchange
 * that keeps the numbers passes: the confirmation names no car and no person.
 *
 * The caller holds `lockEvent(trx, eventId, "noKeyUpdate")`, and writes `retour_at` null
 * in the same transaction (`writeEventFields`): no write on the retour can run in between,
 * and none waiting can write there after. That transaction must be READ COMMITTED, as
 * `atomically` opens it: under REPEATABLE READ, the count keeps the snapshot taken before
 * the lock, misses a write on the retour committed while it waited, finds the numbers
 * unchanged, and leaves that write's row hidden under a `retour_at` null.
 */
export async function removeRetour(
  trx: Kysely<Database>,
  eventId: string,
  confirmed?: LegCounts,
): Promise<RetourRemoval> {
  const now = await countLegRows(trx, eventId, "retour");
  const empty = now.cars === 0 && now.persons === 0;
  const same = confirmed !== undefined && confirmed.cars === now.cars && confirmed.persons === now.persons;
  if (!empty && !same) return { ok: false, error: "confirmRetour", ...now };
  await deleteLegRows(trx, eventId, "retour");
  return { ok: true };
}
