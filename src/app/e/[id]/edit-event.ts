import type { Kysely } from "kysely";
import { lockEvent, readAdminTokenHash, writeEventFields, type PublicEvent } from "@/db/events";
import type { LegCounts } from "@/db/legs";
import type { Database } from "@/db/schema";
import { atomically } from "@/db/transaction";
import { adminTokenMatches } from "@/domain/admin-token";
import {
  eventFieldsOf,
  serverBounds,
  validateEventChange,
  type EventErrors,
  type EventHeader,
} from "@/domain/event";
import { isPublicId } from "@/domain/public-id";
import { isWallClock } from "@/domain/wall-clock";
import { removeRetour } from "./retour";

/**
 * - `ok`: written, with the values now stored.
 * - `errors`: a field refused, by the rules of the creation (M2.3).
 * - `changed`: `before` is no longer what is stored, given in `event` (M6.1, M6.2).
 * - `confirmRetour`: the retour unchecked still holds these, and `removal` is not them (M3.5).
 * - `invalid`: the token is not the event's, or a request no page sends (M8.2).
 * - `eventNotFound`: no such event, or deleted since the page loaded (M8.3).
 *
 * Nothing but `ok` has written anything, and no answer carries the token.
 */
export type EditEventOutcome =
  | { ok: true; event: EventHeader }
  | { ok: false; errors: EventErrors }
  | { ok: false; error: "changed"; event: EventHeader }
  | ({ ok: false; error: "confirmRetour" } & LegCounts)
  | { ok: false; error: "invalid" | "eventNotFound" };

const INVALID = { ok: false, error: "invalid" } as const;
const EVENT_NOT_FOUND = { ok: false, error: "eventNotFound" } as const;

/** `before` as a page sends it, the values it loaded, or nothing: `validateEventChange` throws on another shape. */
function headerOf(input: unknown): EventHeader | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const { title, location, allerAt, retourAt } = input as Record<string, unknown>;
  if (typeof title !== "string" || typeof location !== "string" || !isWallClock(allerAt)) return undefined;
  if (retourAt !== null && !isWallClock(retourAt)) return undefined;
  return { title, location, allerAt, retourAt };
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

function headerFrom(row: PublicEvent): EventHeader {
  return { title: row.title, location: row.location, allerAt: row.aller_at, retourAt: row.retour_at };
}

function sameHeader(a: EventHeader, b: EventHeader): boolean {
  return a.title === b.title && a.location === b.location && a.allerAt === b.allerAt && a.retourAt === b.retourAt;
}

/**
 * The organiser changes the event (epic #250, §3): its title, its location, its start, and
 * its end or none. In this order: the id, the token (`adminTokenMatches`, constant time),
 * the shape of `before` and of `removal`, the fields (`validateEventChange`, against the
 * server's bounds), then one transaction: the Event under `lockEvent(…, "noKeyUpdate")`,
 * `before` compared with that row (`changed`), the retour removed when it is unchecked
 * (`removeRetour`, `confirmRetour`), then the fields written. A `before` forged with a past
 * date makes the bounds skip that date, then is refused as `changed` under the lock.
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
  if (!adminTokenMatches(token, storedHash)) return INVALID;
  const loaded = headerOf(before);
  const confirmed = countsOf(removal);
  if (loaded === undefined || !confirmed.ok) return INVALID;
  const validation = validateEventChange(eventFieldsOf(fields), serverBounds(new Date()), loaded);
  if (!validation.ok) return validation;
  const { event } = validation;

  return atomically(db, async (trx): Promise<EditEventOutcome> => {
    const row = await lockEvent(trx, eventId, "noKeyUpdate");
    if (row === undefined) return EVENT_NOT_FOUND;
    const stored = headerFrom(row);
    if (!sameHeader(stored, loaded)) return { ok: false, error: "changed", event: stored };
    if (event.retourAt === null && stored.retourAt !== null) {
      const removed = await removeRetour(trx, eventId, confirmed.counts);
      if (!removed.ok) return removed;
    }
    return (await writeEventFields(trx, eventId, event)) ? { ok: true, event } : EVENT_NOT_FOUND;
  });
}
