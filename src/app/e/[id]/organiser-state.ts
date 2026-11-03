import type { Kysely } from "kysely";
import { readEventRows } from "@/db/event-rows";
import { readOrganiserAccessEvent, readPendingSend } from "@/db/events";
import type { Database } from "@/db/schema";
import { findSession } from "@/db/sessions";
import { onOneSnapshot } from "@/db/transaction";
import { buildBoard } from "@/domain/board";
import { dayThirty } from "@/domain/day-thirty";
import { eventLegs } from "@/domain/leg";
import { decideOrganiserAccess, organiserProofOf } from "@/domain/organiser-access";
import { organiserPanel, organiserPersons, type OrganiserPanelAnswer } from "@/domain/organiser-panel";
import { pendingNotice } from "@/domain/pending-send";
import { withOrganiserPhones } from "@/domain/phone-visibility";
import { isPublicId } from "@/domain/public-id";
import { findPublicEvent } from "./event";

/**
 * The organiser area's read (epic #154, #3 C4.9 amended, #596): `proof` is the request's body,
 * `{ adminToken, session }`. The panel when organiser-access.ts grants the access, the state it
 * decides and nothing else otherwise; `{ state: "invalid" }` for an unknown event. For the
 * organiser of an anonymised event, what is left of it, its place included, and its day 30. A
 * malformed id is never looked up.
 *
 * Everything is read on one snapshot, the session included. The board is built without a
 * device, and `withOrganiserPhones` sets the numbers DO1 allows only with the access the rule
 * granted: no caller tells it « checked ». Only then is the list of every person built
 * (RP4.2), from the rows without `phonesById`. The tokens are only compared, never logged
 * nor kept; nothing is written, the session's visit included. A pending event's panel carries
 * its notice (OA1.7): the address and the result kept of its email, as read at `now`; the
 * address is read once the access is granted, and is in no other answer.
 */
export async function readOrganiserState(
  db: Kysely<Database>,
  eventId: string,
  proof: unknown,
  now: Date = new Date(),
): Promise<OrganiserPanelAnswer> {
  if (!isPublicId(eventId)) return { state: "invalid" };
  const { adminToken, session } = organiserProofOf(proof);
  return onOneSnapshot(db, async (trx): Promise<OrganiserPanelAnswer> => {
    const event = await findPublicEvent(trx, eventId);
    const accessEvent = await readOrganiserAccessEvent(trx, eventId);
    if (event === undefined || accessEvent === undefined) return { state: "invalid" };
    const decision = decideOrganiserAccess(accessEvent, { adminToken, account: await findSession(trx, session) });
    if (decision.state === "ended") {
      // The organiser's own screen of an anonymised event (OA8.4): what is left, and its day 30.
      const header = { title: event.title, location: event.location, allerAt: event.aller_at, retourAt: event.retour_at };
      return { state: "ended", event: header, erasedOn: dayThirty(header) };
    }
    if (decision.state === "notYours") return decision;
    if (decision.state !== "organiser") return { state: decision.state };
    const { phonesById, ...rows } = await readEventRows(trx, eventId, { stops: event.stops_enabled });
    const legNames = eventLegs(event.retour_at);
    const board = buildBoard(rows, legNames, new Set());
    const legs = withOrganiserPhones(board, phonesById, decision.access, eventId);
    if (legs === undefined) return { state: "invalid" };
    // The list of every person is built once the access is granted, from rows without a number.
    const persons = organiserPersons(rows, legNames);
    const sendRow = await readPendingSend(trx, eventId);
    const pending = sendRow && pendingNotice(sendRow, now);
    const options = { stops: event.stops_enabled };
    return { state: "panel", options, legs: organiserPanel(legs), persons, ...(pending && { pending }) };
  });
}
