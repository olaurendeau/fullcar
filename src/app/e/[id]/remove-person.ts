import type { Kysely } from "kysely";
import { lockEvent, readAdminTokenHash, type EventLock } from "@/db/events";
import { deletePerson, lockPersons, readTokenHolders } from "@/db/persons";
import { deletePlacement } from "@/db/placements";
import { deleteRide, findDrivenRides, lockRides } from "@/db/rides";
import type { Database } from "@/db/schema";
import { atomically } from "@/db/transaction";
import { adminTokenMatches } from "@/domain/admin-token";
import { isCreationId } from "@/domain/creation-id";
import { devicePersonIds, type TokenHolder } from "@/domain/device";
import { LEGS } from "@/domain/leg";
import { isPersonalToken } from "@/domain/personal-token";
import { isPublicId } from "@/domain/public-id";
import { readEventState, type DeviceState } from "./event-state";

/*
 * Removing a person from an event (epic #645, remove-person v2, RP2 and RP3): her row, her
 * Rides, whose passengers are without a car again on that leg, and her Placements, in one
 * transaction. Nothing is kept, and nothing can be undone. Every input is `unknown`: a
 * forged request gets a refusal, never an exception. No token is logged nor answered, and
 * a refusal carries nothing of the person (RP3.1). The device's path is the server action
 * `removePerson` (#668); the organiser's comes with #672.
 */

/**
 * Why nothing was written, in the order the answers are given (RP3.4):
 * - `invalid`: what no page sends, a person id that is not one;
 * - `eventNotFound`: no such event, or a malformed id, never looked up;
 * - `forbidden`: on the device path, a token absent or malformed, or the person of another token;
 * - `noOrganiserAccess`: on the organiser's path, the admin token is not the event's.
 */
export type RemovalRefusal = "invalid" | "eventNotFound" | "forbidden" | "noOrganiserAccess";

/**
 * `removed`, or `alreadyRemoved` for a person the event no longer has (RP2.6): a success,
 * which wrote nothing. Either way, the board the device now sees, read after the commit.
 */
export type RemovePersonOutcome =
  | { ok: true; removal: "removed" | "alreadyRemoved"; state: DeviceState }
  | { ok: false; error: RemovalRefusal };

type Removal = { ok: true; removal: "removed" | "alreadyRemoved" } | { ok: false; error: RemovalRefusal };

const INVALID = { ok: false, error: "invalid" } as const;
const EVENT_NOT_FOUND = { ok: false, error: "eventNotFound" } as const;
const FORBIDDEN = { ok: false, error: "forbidden" } as const;
const REMOVED = { ok: true, removal: "removed" } as const;
const ALREADY_REMOVED = { ok: true, removal: "alreadyRemoved" } as const;

/** What a path checks: the right to remove from this event at all, then this person. */
interface Gate {
  /** Read under the Event's lock: a refusal, or nothing when the right is there. */
  right(trx: Kysely<Database>, eventId: string): Promise<"forbidden" | "noOrganiserAccess" | undefined>;
  /** Whether this person, who is one of the event's, may be removed on this path. */
  mayRemove(holders: readonly TokenHolder[], personId: string): boolean;
}

/** A Ride of hers was committed between the read of her Rides and the lock of her Person. */
class RideAppeared extends Error {
  constructor() {
    super("removePerson: a car of the person appeared meanwhile");
  }
}

/** The person id the body carries, never the URL (RP3.3); nothing for what no page sends. */
function personIdOf(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const { personId } = input as Record<string, unknown>;
  return isCreationId(personId) ? personId : undefined;
}

/**
 * One person removed from the device that signed her up (RP3.1): only a person created
 * with `token` (`devicePersonIds`). A well-formed token with an id the event does not have
 * is `alreadyRemoved` (decision 14).
 */
export function removeFromDevice(
  db: Kysely<Database>,
  eventId: string,
  token: unknown,
  input: unknown,
): Promise<RemovePersonOutcome> {
  const gate: Gate = {
    right: async () => (isPersonalToken(token) ? undefined : "forbidden"),
    mayRemove: (holders, personId) => devicePersonIds(token, holders).includes(personId),
  };
  return removePerson(db, eventId, input, gate, token);
}

/**
 * Anyone removed by the organiser (RP3.2): today the event's admin token alone, compared
 * by `adminTokenMatches` under the Event's lock, then `organiser-access.ts` alone, as
 * `editEvent` already does (#675). A revoked token (#586) is no stored hash, which no
 * token matches. `deviceToken`, the page's personal token, only chooses the board read
 * afterwards: it gives no right here, and no personal token opens this path (RP3.3).
 */
export function removeAsOrganiser(
  db: Kysely<Database>,
  eventId: string,
  adminToken: unknown,
  deviceToken: unknown,
  input: unknown,
): Promise<RemovePersonOutcome> {
  const gate: Gate = {
    right: async (trx, id) => (adminTokenMatches(adminToken, await readAdminTokenHash(trx, id)) ? undefined : "noOrganiserAccess"),
    mayRemove: () => true,
  };
  return removePerson(db, eventId, input, gate, deviceToken);
}

/**
 * The answers in the order of RP3.4: `invalid`, `eventNotFound`, the right (`forbidden` or
 * `noOrganiserAccess`), a person the event does not have (`alreadyRemoved`), the person
 * of another token (`forbidden`), then the removal. `eventEnded` (RP2.9) comes with #674.
 *
 * The application passes the connection: the transaction is `atomically`'s, READ
 * COMMITTED, so that the locks give the rows as committed; the board is read after the
 * commit, on its own snapshot. A transaction passed in is for tests only: a car that
 * appears meanwhile is not tried again there.
 */
async function removePerson(
  db: Kysely<Database>,
  eventId: string,
  input: unknown,
  gate: Gate,
  deviceToken: unknown,
): Promise<RemovePersonOutcome> {
  const personId = personIdOf(input);
  if (personId === undefined) return INVALID;
  if (!isPublicId(eventId)) return EVENT_NOT_FOUND;
  const removal = await removeWithRestart(db, eventId, personId, gate);
  if (!removal.ok) return removal;
  const state = await readEventState(db, eventId, deviceToken);
  // Deleted since the removal: there is nothing left to show.
  if (state === undefined) return EVENT_NOT_FOUND;
  return { ...removal, state };
}

/**
 * At most one restart (« Retirer une personne »). The first attempt holds the Event
 * shared, as every write on a leg. If a car of hers appeared between the read of her Rides
 * and the lock of her Person, it is rolled back, and the restart holds the Event
 * `FOR NO KEY UPDATE`, as a change of the event does: every write on its legs, `offerRide`
 * included, holds it shared from its first statement, so none runs while the restart does,
 * and no car of hers can appear again. There is nothing past the bound, and never a `failed`
 * (RP2.8).
 */
async function removeWithRestart(
  db: Kysely<Database>,
  eventId: string,
  personId: string,
  gate: Gate,
): Promise<Removal> {
  try {
    return await atomically(db, (trx) => removeOnce(trx, eventId, personId, gate, "share"));
  } catch (error) {
    if (!(error instanceof RideAppeared) || db.isTransaction) throw error;
  }
  return atomically(db, (trx) => removeOnce(trx, eventId, personId, gate, "noKeyUpdate"));
}

/**
 * The lock order of « Retirer une personne »: the Event, then her Rides by ascending id,
 * then her Person, and only then the deletes: her Rides, her Placements, her Person. A
 * lone `DELETE` of the Person would lock her before her Rides, by the cascade.
 */
async function removeOnce(
  trx: Kysely<Database>,
  eventId: string,
  personId: string,
  gate: Gate,
  lock: EventLock,
): Promise<Removal> {
  if ((await lockEvent(trx, eventId, lock)) === undefined) return EVENT_NOT_FOUND;
  const refused = await gate.right(trx, eventId);
  if (refused !== undefined) return { ok: false, error: refused };
  const holders = await readTokenHolders(trx, eventId);
  if (!holders.some((holder) => holder.id === personId)) return ALREADY_REMOVED;
  if (!gate.mayRemove(holders, personId)) return FORBIDDEN;

  const driver = { driverId: personId, eventId };
  const rides = await findDrivenRides(trx, driver);
  await lockRides(trx, rides);
  // Removed while this waited: by the other path, or by the same request sent again.
  if ((await lockPersons(trx, eventId, [personId])).length === 0) return ALREADY_REMOVED;
  // Her Person locked, no write can give her a car any more: one not locked appeared meanwhile.
  const locked = new Set(rides.map((ride) => ride.id));
  const drivenNow = await findDrivenRides(trx, driver);
  if (drivenNow.some((ride) => !locked.has(ride.id))) throw new RideAppeared();

  for (const ride of drivenNow) await deleteRide(trx, ride);
  for (const leg of LEGS) await deletePlacement(trx, { personId, eventId, leg });
  await deletePerson(trx, { id: personId, eventId });
  return REMOVED;
}
