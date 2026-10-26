import type { Kysely } from "kysely";
import { readEventRows } from "@/db/event-rows";
import { readAdminTokenHash } from "@/db/events";
import type { Database } from "@/db/schema";
import { onOneSnapshot } from "@/db/transaction";
import { buildBoard } from "@/domain/board";
import { eventLegs } from "@/domain/leg";
import { organiserPanel, organiserPersons, type OrganiserPanelAnswer } from "@/domain/organiser-panel";
import { withOrganiserPhones } from "@/domain/phone-visibility";
import { isPublicId } from "@/domain/public-id";
import { findPublicEvent } from "./event";

/**
 * The organiser area's read (epic #154, #3 C4.9 amended): the panel when `token` is the
 * event's admin token, `{ state: "invalid" }` and nothing else otherwise, an unknown event
 * included. A malformed id is never looked up.
 *
 * Everything is read on one snapshot. The board is built without a device, and
 * `withOrganiserPhones` checks the token against the hash the event keeps, then sets the
 * numbers DO1 allows: no caller tells it « checked ». Only then is the list of every person
 * built (RP4.2), from the rows without `phonesById`. The token is only compared, never
 * logged nor kept; nothing is written.
 */
export async function readOrganiserState(
  db: Kysely<Database>,
  eventId: string,
  token: unknown,
): Promise<OrganiserPanelAnswer> {
  if (!isPublicId(eventId)) return { state: "invalid" };
  return onOneSnapshot(db, async (trx): Promise<OrganiserPanelAnswer> => {
    const event = await findPublicEvent(trx, eventId);
    if (event === undefined) return { state: "invalid" };
    // A revoked token (#586) is no stored hash: no token matches it.
    const storedHash = (await readAdminTokenHash(trx, eventId)) ?? undefined;
    const { phonesById, ...rows } = await readEventRows(trx, eventId);
    const legNames = eventLegs(event.retour_at);
    const board = buildBoard(rows, legNames, new Set());
    const legs = withOrganiserPhones(board, phonesById, { token, storedHash });
    if (legs === undefined) return { state: "invalid" };
    // The list of every person is built once the token is checked, from rows without a number.
    return { state: "panel", legs: organiserPanel(legs), persons: organiserPersons(rows, legNames) };
  });
}
