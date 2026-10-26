import type { Kysely } from "kysely";
import { anonymiseEvent, deleteEvent, findDayThirtyEvents } from "@/db/day-thirty";
import { lockEvent } from "@/db/events";
import type { Database } from "@/db/schema";
import { atomically } from "@/db/transaction";
import { dayThirtyFate, purgeCutoff } from "@/domain/day-thirty";

/** How many events a run anonymised and deleted: the only thing the purge's log may carry. */
export interface DayThirtyCounts {
  anonymised: number;
  deleted: number;
}

/**
 * Day 30 (#588, architecture « La purge »): every event whose day 30 has begun in Paris is
 * anonymised if it has an account (OA8.1, DS4.1), deleted otherwise (OA2.7, DS4.4).
 *
 * Each event in its own transaction (READ COMMITTED, as `atomically` opens it), and none over
 * the whole run: a run interrupted leaves each event intact or done whole, and the next run
 * takes up what is left (OA8.2, DS4.2). The event is read again under `lockEvent(…,
 * "noKeyUpdate")`: its dates, its account and `anonymised_at` as committed, after any write on
 * its legs under way, so an event moved later or anonymised meanwhile is left as it is. The
 * writes that wait for this lock then see `anonymised_at`, or no event, and are refused.
 *
 * A transaction passed in is for tests only: every event is then done in it.
 */
export async function purgeDayThirty(db: Kysely<Database>, now: Date): Promise<DayThirtyCounts> {
  const counts: DayThirtyCounts = { anonymised: 0, deleted: 0 };
  for (const eventId of await findDayThirtyEvents(db, purgeCutoff(now))) {
    const fate = await atomically(db, async (trx) => {
      const event = await lockEvent(trx, eventId, "noKeyUpdate");
      if (event === undefined) return "keep";
      const fate = dayThirtyFate(
        {
          allerAt: event.aller_at,
          retourAt: event.retour_at,
          hasAccount: event.account_id !== null,
          anonymised: event.anonymised_at !== null,
        },
        now,
      );
      if (fate === "anonymise") await anonymiseEvent(trx, eventId);
      if (fate === "delete") await deleteEvent(trx, eventId);
      return fate;
    });
    if (fate === "anonymise") counts.anonymised++;
    if (fate === "delete") counts.deleted++;
  }
  return counts;
}
