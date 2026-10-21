import type { Kysely } from "kysely";
import { readEventRows } from "@/db/event-rows";
import { readTokenHolders } from "@/db/persons";
import type { Database } from "@/db/schema";
import { onOneSnapshot } from "@/db/transaction";
import { buildBoard } from "@/domain/board";
import { devicePersonIds } from "@/domain/device";
import type { EventHeader } from "@/domain/event";
import { eventLegs } from "@/domain/leg";
import { isPersonalToken } from "@/domain/personal-token";
import { withVisiblePhones, type VisibleBoard } from "@/domain/phone-visibility";
import { isPublicId } from "@/domain/public-id";
import { findPublicEvent } from "./event";

/**
 * The event as one device sees it, plain data ready for the browser: what the page shows at
 * its top (title, place, start and end), and each of its legs (epic #250).
 */
export interface EventState {
  event: EventHeader;
  legs: VisibleBoard;
}

/**
 * The only read of an event's participants (epic #66): its rows, the device's persons,
 * the board, then the numbers this device may see (C10.1), with the event's header taken from
 * the row read first: never a leg the header no longer has. Nothing for an unknown event; a
 * malformed id is never looked up.
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
    const header = { title: event.title, location: event.location, allerAt: event.aller_at, retourAt: event.retour_at };
    return {
      event: header,
      legs: withVisiblePhones(buildBoard(rows, eventLegs(event.retour_at), deviceIds), phonesById, deviceIds),
    };
  });
}
