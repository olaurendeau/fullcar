import type { Kysely } from "kysely";
import {
  CONFIRMATION_LINK_LIFETIME_MS,
  LINK_KEPT_AFTER_EXPIRY_MS,
  LOGIN_LINK_LIFETIME_MS,
  SESSION_LIFETIME_MS,
  TRANSFER_LINK_LIFETIME_MS,
} from "@/domain/account-rules";
import { SEND_WINDOW_MS } from "@/domain/send-limits";
import type { Database } from "./schema";

/*
 * The clean-up by age of the tables that hold to no event (#589, « La purge » in
 * architecture.md): a row goes once no rule reads it any more, never before. One statement
 * per table, each its own transaction: no transaction around the purge.
 */

/** How many rows of each table a run deleted: the only thing the purge's log may carry. */
export interface ExpiredRowCounts {
  sessions: number;
  links: number;
  sends: number;
}

const before = (now: Date, ms: number) => new Date(now.getTime() - ms);

/**
 * Deletes the sessions ended 90 days after their last visit (`sessionIsAlive`), the sends out
 * of the hour of the limits (`inSendWindow`), and the links 30 days after their expiry, used
 * or not (`linkDeletedAt`). A confirmation link of a pending event stays as long as its event:
 * expired, it still sends a new one (OA5.6), and it goes with the event on day 30. A transfer
 * link stays as long as the handover of its event waits (the notice reads the latest one to say
 * « expiré »): that handover is erased on day 30, with the event's links, or with the account's
 * deletion, and the link goes 30 days after its expiry once nothing waits on it. A read of
 * `event`, without a lock: the order Event, then link, stays whole.
 */
export async function deleteExpiredRows(db: Kysely<Database>, now: Date): Promise<ExpiredRowCounts> {
  const sessions = await db
    .deleteFrom("session")
    .where("last_visit_at", "<=", before(now, SESSION_LIFETIME_MS))
    .executeTakeFirst();
  const links = await db
    .deleteFrom("email_link")
    .where((eb) =>
      eb.or([
        eb.and([eb("kind", "=", "login"), eb("created_at", "<=", before(now, LOGIN_LINK_LIFETIME_MS + LINK_KEPT_AFTER_EXPIRY_MS))]),
        eb.and([
          eb("kind", "=", "confirmation"),
          eb("created_at", "<=", before(now, CONFIRMATION_LINK_LIFETIME_MS + LINK_KEPT_AFTER_EXPIRY_MS)),
          // While its event is pending, the link page still reads it to send a new one (OA5.6, OA7.7).
          eb.not(
            eb.exists(
              eb
                .selectFrom("event")
                .select("event.id")
                .whereRef("event.id", "=", "email_link.event_id")
                .where("event.confirmed_at", "is", null),
            ),
          ),
        ]),
        eb.and([
          eb("kind", "=", "transfer"),
          eb("created_at", "<=", before(now, TRANSFER_LINK_LIFETIME_MS + LINK_KEPT_AFTER_EXPIRY_MS)),
          // While the handover of its event waits, the notice still reads it to say « expiré » (OT2.6).
          eb.not(
            eb.exists(
              eb
                .selectFrom("event")
                .select("event.id")
                .whereRef("event.id", "=", "email_link.event_id")
                .where("event.transfer_email", "is not", null),
            ),
          ),
        ]),
      ]),
    )
    .executeTakeFirst();
  const sends = await db.deleteFrom("email_send").where("sent_at", "<=", before(now, SEND_WINDOW_MS)).executeTakeFirst();
  return {
    sessions: Number(sessions.numDeletedRows),
    links: Number(links.numDeletedRows),
    sends: Number(sends.numDeletedRows),
  };
}
