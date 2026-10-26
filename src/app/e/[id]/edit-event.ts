import type { Kysely } from "kysely";
import { isAnonymised } from "@/db/day-thirty";
import { lockEvent, readAdminTokenHash, writeEventFields } from "@/db/events";
import type { LegCounts } from "@/db/legs";
import type { Database } from "@/db/schema";
import { atomically } from "@/db/transaction";
import { adminTokenMatches } from "@/domain/admin-token";
import {
  eventFieldsOf,
  locationPositionOf,
  serverBounds,
  validateEventChange,
  type EventChange,
  type EventErrors,
  type EventHeader,
} from "@/domain/event";
import { positionOf, samePosition } from "@/domain/place";
import { isPublicId } from "@/domain/public-id";
import { isWallClock } from "@/domain/wall-clock";
import { headerFrom } from "./event";
import { removeRetour } from "./retour";

/**
 * - `ok`: written, with the values now stored.
 * - `errors`: a field refused, by the rules of the creation (M2.3).
 * - `changed`: `before` is no longer what is stored, given in `event` (M6.1, M6.2).
 * - `confirmRetour`: the retour unchecked still holds these, and `removal` is not them (M3.5).
 * - `invalid`: the token is not the event's, or a request no page sends (M8.2).
 * - `eventNotFound`: no such event, or deleted since the page loaded (M8.3).
 * - `eventEnded`: the event is anonymised, or was while the change waited for its lock
 *   (#588): before the token, which anonymising revoked.
 *
 * Nothing but `ok` has written anything, and no answer carries the token.
 */
export type EditEventOutcome =
  | { ok: true; event: EventHeader }
  | { ok: false; errors: EventErrors }
  | { ok: false; error: "changed"; event: EventHeader }
  | ({ ok: false; error: "confirmRetour" } & LegCounts)
  | { ok: false; error: "invalid" | "eventNotFound" | "eventEnded" };

const INVALID = { ok: false, error: "invalid" } as const;
const EVENT_NOT_FOUND = { ok: false, error: "eventNotFound" } as const;
const EVENT_ENDED = { ok: false, error: "eventEnded" } as const;

/**
 * `before` as a page sends it, the values it loaded, or nothing: `validateEventChange` throws on
 * another shape. A page from before the positions sends no `locationPosition`, one from before
 * the description no `description`: each is then compared without it.
 */
function headerOf(input: unknown): EventChange | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const { title, location, allerAt, retourAt, locationPosition, description } = input as Record<string, unknown>;
  if (typeof title !== "string" || typeof location !== "string" || !isWallClock(allerAt)) return undefined;
  if (retourAt !== null && !isWallClock(retourAt)) return undefined;
  if (description !== undefined && description !== null && typeof description !== "string") return undefined;
  const header: EventChange = { title, location, allerAt, retourAt };
  if (description !== undefined) header.description = description;
  if (locationPosition === undefined) return header;
  const position = positionOf(locationPosition);
  return "error" in position ? undefined : { ...header, locationPosition: position.value };
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

/** `removal` as the confirmation sends it: absent, or the two numbers it showed. */
function countsOf(input: unknown): { ok: true; counts?: LegCounts } | { ok: false } {
  if (input === undefined) return { ok: true };
  if (typeof input !== "object" || input === null || Array.isArray(input)) return { ok: false };
  const { cars, persons } = input as Record<string, unknown>;
  return isCount(cars) && isCount(persons) ? { ok: true, counts: { cars, persons } } : { ok: false };
}

/**
 * `loaded` without a position, from a page before the positions, is compared without it; without
 * a description, from a page before the description, too.
 */
function sameHeader(stored: EventHeader, loaded: EventChange): boolean {
  return (
    stored.title === loaded.title &&
    stored.location === loaded.location &&
    stored.allerAt === loaded.allerAt &&
    stored.retourAt === loaded.retourAt &&
    (loaded.locationPosition === undefined || samePosition(stored.locationPosition, loaded.locationPosition)) &&
    (loaded.description === undefined || stored.description === loaded.description)
  );
}

/**
 * The organiser changes the event (epic #250, §3): its title, its location and its position,
 * its start, and its end or none. In this order: the id, the token (`adminTokenMatches`,
 * constant time), the shape of `before`, of `removal` and of the position sent, the fields
 * (`validateEventChange`, against the server's bounds), then one transaction: the Event
 * under `lockEvent(…, "noKeyUpdate")`, `before` compared with that row (`changed`), the
 * retour removed when it is unchecked (`removeRetour`, `confirmRetour`), then the fields
 * written. A `before` forged with a past date makes the bounds skip that date, then is
 * refused as `changed` under the lock. A position not sent, by a page from before the
 * positions, keeps the one stored, even with another text (D6, AL5.6); a description not
 * sent keeps the one stored.
 *
 * The application passes the connection: the transaction is `atomically`'s, READ COMMITTED,
 * so that the retour, counted again after the lock, includes a write committed while the
 * change waited for it (M3.6). `before` is compared with the row the lock gives, never
 * with a snapshot taken before it. A transaction passed in is for tests only: in REPEATABLE
 * READ, as withRollback opens it, the count would miss such a write, and leave its row
 * under a `retour_at` null. The options are not touched. The token is only compared, never
 * logged, kept nor answered.
 */
export async function editEvent(
  db: Kysely<Database>,
  eventId: string,
  token: unknown,
  fields: unknown,
  before: unknown,
  removal?: unknown,
): Promise<EditEventOutcome> {
  if (!isPublicId(eventId)) return EVENT_NOT_FOUND;
  const storedHash = await readAdminTokenHash(db, eventId);
  if (storedHash === undefined) return EVENT_NOT_FOUND;
  // Anonymised, the event has no token left (event_anonymised_bare): only then is it looked up.
  if (storedHash === null && (await isAnonymised(db, eventId))) return EVENT_ENDED;
  if (!adminTokenMatches(token, storedHash)) return INVALID;
  const loaded = headerOf(before);
  const confirmed = countsOf(removal);
  const sent = eventFieldsOf(fields);
  if (loaded === undefined || !confirmed.ok || "error" in locationPositionOf(sent)) return INVALID;
  const validation = validateEventChange(sent, serverBounds(new Date()), loaded);
  if (!validation.ok) return validation;
  const { event } = validation;

  return atomically(db, async (trx): Promise<EditEventOutcome> => {
    const row = await lockEvent(trx, eventId, "noKeyUpdate");
    if (row === undefined) return EVENT_NOT_FOUND;
    if (row.anonymised_at !== null) return EVENT_ENDED;
    const stored = headerFrom(row);
    if (!sameHeader(stored, loaded)) return { ok: false, error: "changed", event: stored };
    if (event.retourAt === null && stored.retourAt !== null) {
      const removed = await removeRetour(trx, eventId, confirmed.counts);
      if (!removed.ok) return removed;
    }
    if (!(await writeEventFields(trx, eventId, event))) return EVENT_NOT_FOUND;
    // Not sent, the position stored is kept (D6, AL5.6), and the description stored: the answer says it.
    const { locationPosition = stored.locationPosition, description = stored.description } = event;
    return { ok: true, event: { ...event, locationPosition, description } };
  });
}
