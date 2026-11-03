import type { Kysely } from "kysely";
import { lockEvent, readOrganiserAccessEvent, writeEventFields } from "@/db/events";
import type { LegCounts } from "@/db/legs";
import type { Database } from "@/db/schema";
import { findSession } from "@/db/sessions";
import { countStopRides } from "@/db/stops";
import { atomically } from "@/db/transaction";
import {
  eventFieldsOf,
  locationPositionOf,
  serverBounds,
  validateEventChange,
  type EventChange,
  type EventErrors,
  type EventHeader,
} from "@/domain/event";
import { decideOrganiserAccess, organiserProofOf } from "@/domain/organiser-access";
import { positionOf, samePosition } from "@/domain/place";
import { isPublicId } from "@/domain/public-id";
import { isWallClock } from "@/domain/wall-clock";
import { headerFrom } from "./event";
import { removeRetour } from "./retour";

/**
 * - `ok`: written, with the values now stored, the option « Points de RDV » included.
 * - `errors`: a field refused, by the rules of the creation (M2.3).
 * - `changed`: `before` is no longer what is stored, given in `event` and `stops` (M6.1, M6.2).
 * - `stopsLocked`: the option « Points de RDV » is turned off while `cars` cars have Stops, counted
 *   under the Event's lock (RV9.3, D1): the option stays, and nothing is written.
 * - `confirmRetour`: the retour unchecked still holds these, and `removal` is not them (M3.5).
 * - `invalid`: organiser-access.ts grants no access (M8.2, OA7.1–OA7.9), before the lock or under
 *   it (#836), or a request no page sends.
 * - `eventNotFound`: no such event, or deleted since the page loaded (M8.3).
 * - `eventEnded`: the event is anonymised, or was while the change waited for its lock
 *   (#588): before the access, since anonymising revoked the token.
 *
 * Nothing but `ok` has written anything, and no answer carries the token.
 */
export type EditEventOutcome =
  | { ok: true; event: EventHeader; stops: boolean }
  | { ok: false; errors: EventErrors }
  | { ok: false; error: "changed"; event: EventHeader; stops: boolean }
  | { ok: false; error: "stopsLocked"; cars: number }
  | ({ ok: false; error: "confirmRetour" } & LegCounts)
  | { ok: false; error: "invalid" | "eventNotFound" | "eventEnded" };

const INVALID = { ok: false, error: "invalid" } as const;
const EVENT_NOT_FOUND = { ok: false, error: "eventNotFound" } as const;
const EVENT_ENDED = { ok: false, error: "eventEnded" } as const;

type AccessRefusal = typeof INVALID | typeof EVENT_NOT_FOUND | typeof EVENT_ENDED;

/**
 * Why `proof` opens nothing on the event, as `db` reads it now; nothing when it is the
 * organiser's. An event anonymised answers `eventEnded` before the access: anonymising revoked
 * the token, and nobody may write any more (#588). Read before the lock, to refuse without
 * waiting for it, and again under it (#836): a session closed, an account deleted or a token
 * revoked while the change waited is then seen, as committed.
 */
async function accessRefusal(db: Kysely<Database>, eventId: string, proof: unknown): Promise<AccessRefusal | undefined> {
  const accessEvent = await readOrganiserAccessEvent(db, eventId);
  if (accessEvent === undefined) return EVENT_NOT_FOUND;
  if (accessEvent.anonymised) return EVENT_ENDED;
  const { adminToken, session } = organiserProofOf(proof);
  const decision = decideOrganiserAccess(accessEvent, { adminToken, account: await findSession(db, session) });
  return decision.state === "organiser" ? undefined : INVALID;
}

/**
 * `before` as a page sends it, the values it loaded, or nothing: `validateEventChange` throws on
 * another shape. A page from before the positions sends no `locationPosition`, one from before
 * the description no `description`, one from before the option no `stops`: each is then compared
 * without it.
 */
function headerOf(input: unknown): EventChange | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const { title, location, allerAt, retourAt, locationPosition, description, stops } = input as Record<string, unknown>;
  if (typeof title !== "string" || typeof location !== "string" || !isWallClock(allerAt)) return undefined;
  if (retourAt !== null && !isWallClock(retourAt)) return undefined;
  if (description !== undefined && description !== null && typeof description !== "string") return undefined;
  if (stops !== undefined && typeof stops !== "boolean") return undefined;
  const header: EventChange = { title, location, allerAt, retourAt };
  if (description !== undefined) header.description = description;
  if (stops !== undefined) header.stops = stops;
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
 * a description, from a page before the description, too; without `stops`, from a page before the
 * option, `stopsEnabled` is not compared.
 */
function sameHeader(stored: EventHeader, stopsEnabled: boolean, loaded: EventChange): boolean {
  return (
    stored.title === loaded.title &&
    stored.location === loaded.location &&
    stored.allerAt === loaded.allerAt &&
    stored.retourAt === loaded.retourAt &&
    (loaded.locationPosition === undefined || samePosition(stored.locationPosition, loaded.locationPosition)) &&
    (loaded.description === undefined || stored.description === loaded.description) &&
    (loaded.stops === undefined || stopsEnabled === loaded.stops)
  );
}

/**
 * The organiser changes the event (epic #250, §3): its title, its location and its position,
 * its start, and its end or none. `proof` is the request's body, `{ adminToken, session }`. In
 * this order: the id, the access (organiser-access.ts: the session of the event's account, or
 * the creation browser's token, compared in constant time), the shape of `before`, of
 * `removal` and of the position sent, the fields (`validateEventChange`, against the
 * server's bounds), then one transaction: the Event
 * under `lockEvent(…, "noKeyUpdate")`, the access decided again under it (#836), `before`
 * compared with that row (`changed`), the
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
 * under a `retour_at` null. Of the options, only « Points de RDV » is touched (D1), when `stops`
 * is sent: turned on, always; turned off, only while no car has Stops, counted again under the
 * Event's lock like the retour's (RV9.3), so that no Stop is ever left under a disabled option: a
 * car offered with Stops that waits for the lock finds it off (`stopsOff`). The answer carries the
 * option stored. The tokens are only compared, never logged, kept nor answered.
 */
export async function editEvent(
  db: Kysely<Database>,
  eventId: string,
  proof: unknown,
  fields: unknown,
  before: unknown,
  removal?: unknown,
): Promise<EditEventOutcome> {
  if (!isPublicId(eventId)) return EVENT_NOT_FOUND;
  const refused = await accessRefusal(db, eventId, proof);
  if (refused) return refused;
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
    // The access again, as committed once the lock is obtained (#836).
    const refusedNow = await accessRefusal(trx, eventId, proof);
    if (refusedNow) return refusedNow;
    const stored = headerFrom(row);
    if (!sameHeader(stored, row.stops_enabled, loaded)) {
      return { ok: false, error: "changed", event: stored, stops: row.stops_enabled };
    }
    // Counted under the lock: a car offered with Stops that committed while this waited is seen.
    if (event.stops === false && row.stops_enabled) {
      const cars = await countStopRides(trx, eventId);
      if (cars > 0) return { ok: false, error: "stopsLocked", cars };
    }
    if (event.retourAt === null && stored.retourAt !== null) {
      const removed = await removeRetour(trx, eventId, confirmed.counts);
      if (!removed.ok) return removed;
    }
    if (!(await writeEventFields(trx, eventId, event))) return EVENT_NOT_FOUND;
    // Not sent, the position stored is kept (D6, AL5.6), and the description stored: the answer says it.
    const { locationPosition = stored.locationPosition, description = stored.description } = event;
    const { stops, ...header } = event;
    return { ok: true, event: { ...header, locationPosition, description }, stops: stops ?? row.stops_enabled };
  });
}
