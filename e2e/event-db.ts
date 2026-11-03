import type { Kysely } from "kysely";
import { removeRetour } from "@/app/e/[id]/retour";
import { lockEvent, writeEventFields, type EventFieldsChange } from "@/db/events";
import { countLegRows } from "@/db/legs";
import type { Database } from "@/db/schema";
import { seedLink } from "@/db/test-accounts";
import { atomically } from "@/db/transaction";

/*
 * The organiser's change of an event, made in the slot's database while a page is open
 * (epic #250), until `/admin` can make it: as `updateEvent` will, in one transaction under
 * the Event's lock, with #260's functions. A retour removed loses its cars and its
 * Placements, confirmed with the numbers it holds.
 */

/** Changes `change`'s fields of event `eventId`, the others kept. */
export async function editEventInDb(db: Kysely<Database>, eventId: string, change: Partial<EventFieldsChange>) {
  await atomically(db, async (trx) => {
    const event = await lockEvent(trx, eventId, "noKeyUpdate");
    if (event === undefined) throw new Error("e2e: no event to change");
    const { title, location, aller_at: allerAt, retour_at: retourAt } = event;
    const fields = { title, location, allerAt, retourAt, ...change };
    if (retourAt !== null && fields.retourAt === null) {
      const removal = await removeRetour(trx, eventId, await countLegRows(trx, eventId, "retour"));
      if (!removal.ok) throw new Error("e2e: the retour was not removed");
    }
    await writeEventFields(trx, eventId, fields);
  });
}

/** The retour of event `eventId` removed, with what it held. */
export const removeRetourInDb = (db: Kysely<Database>, eventId: string) => editEventInDb(db, eventId, { retourAt: null });

/**
 * A handover waiting on `email` (epic #935), as a sent transfer email leaves it: the address
 * on the event and its link, made now or at `linkCreatedAt` (older than 7 days: expired).
 */
export async function startTransferInDb(db: Kysely<Database>, eventId: string, email: string, linkCreatedAt?: Date) {
  await db
    .updateTable("event")
    .set({ transfer_email: email, transfer_status: "sent", transfer_status_at: linkCreatedAt ?? new Date() })
    .where("id", "=", eventId)
    .execute();
  await seedLink(db, { kind: "transfer", eventId }, { createdAt: linkCreatedAt });
}
