import type { Kysely } from "kysely";
import { readEventRows } from "@/db/event-rows";
import { readTokenHolders } from "@/db/persons";
import type { Database } from "@/db/schema";
import { onOneSnapshot } from "@/db/transaction";
import { buildBoard } from "@/domain/board";
import { devicePersonIds } from "@/domain/device";
import { eventLegs } from "@/domain/leg";
import { isPersonalToken } from "@/domain/personal-token";
import { withVisiblePhones, type VisibleBoard } from "@/domain/phone-visibility";
import { isPublicId } from "@/domain/public-id";
import { findPublicEvent } from "./event";

/** Each leg of the event as one device sees it: plain data, ready for the browser. */
export type EventState = VisibleBoard;

/**
 * The only read of an event's participants (epic #66): its rows, the device's persons,
 * the board, then the numbers this device may see (C10.1). Nothing for an unknown event;
 * a malformed id is never looked up.
 *
 * Without a token, or with a malformed one, the device has no person and no number leaves
 * the server (C10.6, C12.3). Everything is read on one snapshot, so that a passenger who
 * boards between two reads is not shown without a car. The token is only compared, never
 * logged nor kept.
 */
export async function readEventState(
  db: Kysely<Database>,
  eventId: string,
  token?: unknown,
): Promise<EventState | undefined> {
  if (!isPublicId(eventId)) return undefined;
  return onOneSnapshot(db, async (trx) => {
    const event = await findPublicEvent(trx, eventId);
    if (event === undefined) return undefined;
    const { phonesById, ...rows } = await readEventRows(trx, eventId);
    const holders = isPersonalToken(token) ? await readTokenHolders(trx, eventId) : [];
    // One set for the board and the numbers: the device section and the cards follow one device.
    const deviceIds: ReadonlySet<string> = new Set(devicePersonIds(token, holders));
    return withVisiblePhones(buildBoard(rows, eventLegs(event.retour_at), deviceIds), phonesById, deviceIds);
  });
}
