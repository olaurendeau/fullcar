import type { Kysely } from "kysely";
import { isAnonymised } from "@/db/day-thirty";
import { readEventRows } from "@/db/event-rows";
import type { PublicEvent } from "@/db/events";
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
import type { WallClock } from "@/domain/wall-clock";
import { findPublicEvent, headerFrom } from "./event";

/**
 * The event as one device sees it, plain data ready for the browser: what the page shows at
 * its top (title, place and its position, start and end), and each of its legs (epic #250).
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
    return stateOf(trx, event, token);
  });
}

/** The state of `event`, read in the snapshot `trx` holds, for the device of `token`. */
async function stateOf(trx: Kysely<Database>, event: PublicEvent, token: unknown): Promise<EventState> {
  const { phonesById, ...rows } = await readEventRows(trx, event.id);
  const holders = isPersonalToken(token) ? await readTokenHolders(trx, event.id) : [];
  // One set for the board and the numbers: the device section and the cards follow one device.
  const deviceIds: ReadonlySet<string> = new Set(devicePersonIds(token, holders));
  return {
    event: headerFrom(event),
    legs: withVisiblePhones(buildBoard(rows, eventLegs(event.retour_at), deviceIds), phonesById, deviceIds),
  };
}

/**
 * An event anonymised at day 30, as anyone holding its link sees it: « Événement terminé »,
 * its title and its start (OA8.3). Neither its place, which may be someone's address, nor
 * anyone: nobody is left.
 */
export interface EndedEvent {
  ended: true;
  title: string;
  allerAt: WallClock;
}

/**
 * What a device reads of the event once its page is open (#799): its state as `readEventState`
 * reads it, or, once anonymised, the event ended and nothing else. The event and its legs on
 * one snapshot, so that an event anonymised meanwhile never gives its place with empty legs.
 * Nothing for an unknown event; a malformed id is never looked up. The token is only
 * compared, never logged nor kept.
 */
export async function readDeviceState(
  db: Kysely<Database>,
  eventId: string,
  token?: unknown,
): Promise<EventState | EndedEvent | undefined> {
  if (!isPublicId(eventId)) return undefined;
  return onOneSnapshot(db, async (trx): Promise<EventState | EndedEvent | undefined> => {
    const event = await findPublicEvent(trx, eventId);
    if (event === undefined) return undefined;
    if (await isAnonymised(trx, eventId)) return { ended: true, title: event.title, allerAt: event.aller_at };
    return stateOf(trx, event, token);
  });
}
