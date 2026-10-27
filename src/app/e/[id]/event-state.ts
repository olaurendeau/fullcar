import type { Kysely } from "kysely";
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
 * An event anonymised at day 30, as anyone holding its link sees it: « Événement terminé »,
 * its title and its start (OA8.3). Neither its place, which may be someone's address, nor
 * anyone: nobody is left.
 */
export interface EndedEvent {
  ended: true;
  title: string;
  allerAt: WallClock;
}

/** What a device is given of the event: its state, or, once anonymised, the event ended. */
export type DeviceState = EventState | EndedEvent;

/**
 * The only read of an event's participants (epic #66): its rows, the device's persons,
 * the board, then the numbers this device may see (C10.1), with the event's header taken from
 * the row read first: never a leg the header no longer has. Once anonymised, the event ended
 * and nothing else (OA8.3, #806): every action that answers with a state reads it here, its
 * refusal by `eventEnded` included, so none gives the place. Nothing for an unknown event; a
 * malformed id is never looked up.
 *
 * Without a token, or with a malformed one, the device has no person and no number leaves
 * the server (C10.6, C12.3). Everything is read on one snapshot, so that a passenger who
 * boards between two reads is not shown without a car, and an event anonymised meanwhile
 * never gives its place with empty legs (#799). The token is only compared, never logged
 * nor kept.
 */
export async function readEventState(
  db: Kysely<Database>,
  eventId: string,
  token?: unknown,
): Promise<DeviceState | undefined> {
  if (!isPublicId(eventId)) return undefined;
  return onOneSnapshot(db, async (trx): Promise<DeviceState | undefined> => {
    const event = await findPublicEvent(trx, eventId);
    if (event === undefined) return undefined;
    return endedOf(event) ?? stateOf(trx, event, token);
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

/** What is left of `event` once anonymised, nothing before. */
function endedOf(event: PublicEvent): EndedEvent | undefined {
  return event.anonymised_at === null ? undefined : { ended: true, title: event.title, allerAt: event.aller_at };
}

/**
 * What `/e/{id}` shows: the event as anyone holding the link sees it, or, once it is
 * anonymised, « Événement terminé » with its title and its start only (OA8.3, #590).
 */
export type EventPage = { ended: false; state: EventState } | EndedEvent;

/**
 * The page's read, without a device: the server never has one (C10.2). The event and its
 * legs on one snapshot, so that an event anonymised meanwhile never shows its place with an
 * empty board. Nothing for an unknown event; a malformed id is never looked up.
 */
export async function readEventPage(db: Kysely<Database>, eventId: string): Promise<EventPage | undefined> {
  if (!isPublicId(eventId)) return undefined;
  return onOneSnapshot(db, async (trx): Promise<EventPage | undefined> => {
    const event = await findPublicEvent(trx, eventId);
    if (event === undefined) return undefined;
    return endedOf(event) ?? { ended: false, state: await stateOf(trx, event, undefined) };
  });
}
