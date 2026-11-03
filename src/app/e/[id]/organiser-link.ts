import type { Kysely } from "kysely";
import { readOrganiserAccessEvent } from "@/db/events";
import type { Database } from "@/db/schema";
import { findSession } from "@/db/sessions";
import { onOneSnapshot } from "@/db/transaction";
import { decideOrganiserAccess } from "@/domain/organiser-access";
import { isPublicId } from "@/domain/public-id";

/**
 * Whether « Espace organisateur » shows on `/e/{id}` for a session (OA7.4): the session of the
 * event's account, as the one rule decides (organiser-access.ts). `session` is the request's
 * body, the token session-token.ts keeps. The admin token is not asked: the browser that keeps
 * it knows it without a request, and it goes to `/e/{id}/admin` only (O6.1). Nothing else is
 * said, to the organiser or to anybody: no reason for a refusal, no address. Another account's
 * session, an unknown event, a malformed id and an anonymised event, which has no board, have
 * no link. Nothing is written, the session's visit included.
 */
export async function readOrganiserLink(db: Kysely<Database>, eventId: string, session: unknown): Promise<boolean> {
  if (!isPublicId(eventId)) return false;
  return onOneSnapshot(db, async (trx) => {
    const event = await readOrganiserAccessEvent(trx, eventId);
    if (event === undefined) return false;
    const account = await findSession(trx, session);
    return decideOrganiserAccess(event, { adminToken: undefined, account }).state === "organiser";
  });
}
