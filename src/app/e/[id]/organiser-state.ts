import type { Kysely } from "kysely";
import { readEventRows } from "@/db/event-rows";
import { readOrganiserAccessEvent } from "@/db/events";
import type { Database } from "@/db/schema";
import { findSession } from "@/db/sessions";
import { onOneSnapshot } from "@/db/transaction";
import { buildBoard } from "@/domain/board";
import { eventLegs } from "@/domain/leg";
import { decideOrganiserAccess, organiserProofOf } from "@/domain/organiser-access";
import { organiserPanel, organiserPersons, type OrganiserPanelAnswer } from "@/domain/organiser-panel";
import { withOrganiserPhones } from "@/domain/phone-visibility";
import { isPublicId } from "@/domain/public-id";
import { findPublicEvent } from "./event";

/**
 * The organiser area's read (epic #154, #3 C4.9 amended, #596): `proof` is the request's body,
 * `{ adminToken, session }`. The panel when organiser-access.ts grants the access, the state it
 * decides and nothing else otherwise; `{ state: "invalid" }` for an unknown event. A
 * malformed id is never looked up.
 *
 * Everything is read on one snapshot, the session included. The board is built without a
 * device, and `withOrganiserPhones` sets the numbers DO1 allows only with the access the rule
 * granted: no caller tells it « checked ». Only then is the list of every person built
 * (RP4.2), from the rows without `phonesById`. The tokens are only compared, never logged
 * nor kept; nothing is written, the session's visit included.
 */
export async function readOrganiserState(db: Kysely<Database>, eventId: string, proof: unknown): Promise<OrganiserPanelAnswer> {
  if (!isPublicId(eventId)) return { state: "invalid" };
  const { adminToken, session } = organiserProofOf(proof);
  return onOneSnapshot(db, async (trx): Promise<OrganiserPanelAnswer> => {
    const event = await findPublicEvent(trx, eventId);
    const accessEvent = await readOrganiserAccessEvent(trx, eventId);
    if (event === undefined || accessEvent === undefined) return { state: "invalid" };
    const decision = decideOrganiserAccess(accessEvent, { adminToken, account: await findSession(trx, session) });
    if (decision.state !== "organiser") return decision;
    const { phonesById, ...rows } = await readEventRows(trx, eventId);
    const legNames = eventLegs(event.retour_at);
    const board = buildBoard(rows, legNames, new Set());
    const legs = withOrganiserPhones(board, phonesById, decision.access, eventId);
    if (legs === undefined) return { state: "invalid" };
    // The list of every person is built once the access is granted, from rows without a number.
    return { state: "panel", legs: organiserPanel(legs), persons: organiserPersons(rows, legNames) };
  });
}
