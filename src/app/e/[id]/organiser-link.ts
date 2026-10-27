import type { Kysely } from "kysely";
import { readOrganiserAccessEvent } from "@/db/events";
import type { Database } from "@/db/schema";
import { findSession } from "@/db/sessions";
import { onOneSnapshot } from "@/db/transaction";
import { decideOrganiserAccess, organiserProofOf } from "@/domain/organiser-access";
import { isPublicId } from "@/domain/public-id";

/**
 * Whether « Espace organisateur » shows on `/e/{id}` (OA7.4): the organiser's session, or the
 * browser that keeps the event's admin token, as the one rule decides (organiser-access.ts).
 * `proof` is the request's body, `{ adminToken, session }`. Nothing else is said, to the
 * organiser or to anybody: no reason for a refusal, no address, and nothing of the panel. An
 * unknown event, a malformed id and an anonymised event, which has no board, have no link.
 * Nothing is written, the session's visit included.
 */
export async function readOrganiserLink(db: Kysely<Database>, eventId: string, proof: unknown): Promise<boolean> {
  if (!isPublicId(eventId)) return false;
  const { adminToken, session } = organiserProofOf(proof);
  return onOneSnapshot(db, async (trx) => {
    const event = await readOrganiserAccessEvent(trx, eventId);
    if (event === undefined) return false;
    return decideOrganiserAccess(event, { adminToken, account: await findSession(trx, session) }).state === "organiser";
  });
}
