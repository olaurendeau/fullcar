import type { Kysely } from "kysely";
import { insertPerson, readTokenHolders, updatePerson as storePersonFields } from "@/db/persons";
import { deletePlacement, setPlacement } from "@/db/placements";
import { drivesOn } from "@/db/rides";
import type { Database } from "@/db/schema";
import { atomically } from "@/db/transaction";
import { isCreationId } from "@/domain/creation-id";
import { devicePersonIds } from "@/domain/device";
import { eventLegs, initialLegs, type Leg } from "@/domain/leg";
import { validatePerson, type PersonErrors, type PersonField } from "@/domain/person";
import { isPersonalToken } from "@/domain/personal-token";
import { hashToken, tokenMatches } from "@/domain/token-hash";
import { findPublicEvent } from "./event";
import { readEventState, type EventState } from "./event-state";

/*
 * Registering and changing a person (epic #66, R1 to R3, R7). Every input is `unknown`: a
 * forged request gets a refusal or field errors, never an exception. The personal token is
 * only hashed or compared, never logged nor returned.
 */

/** Why nothing was written, for the view to translate. */
export type PersonRefusal =
  /** No such event, or a malformed id. */
  | "eventNotFound"
  /** The token is malformed or absent, the person is not the device's, or the id is someone else's. */
  | "forbidden"
  /** The person drives on that leg: she has no Placement there to change. */
  | "drives"
  /** Something only a forged request sends: an id, a leg or a state that is not one. */
  | "invalid";

type Refused = Exclude<PersonRefusal, "eventNotFound">;

export type PersonOutcome =
  | { ok: true; state: EventState }
  | { ok: false; errors: PersonErrors; first: PersonField }
  | { ok: false; error: "eventNotFound" }
  | { ok: false; error: Refused; state: EventState };

type Written = { ok: true } | { ok: false; error: "eventNotFound" } | { ok: false; error: Refused };

const FORBIDDEN = { ok: false, error: "forbidden" } as const;
const INVALID = { ok: false, error: "invalid" } as const;

/** What `setPersonLeg` may make of a person on a leg: the two states she declares herself. */
const DECLARED_KINDS = ["withoutCar", "notConcerned"] as const;

function fieldsOf(input: unknown): Record<string, unknown> {
  return typeof input === "object" && input !== null ? { ...input } : {};
}

/**
 * Commits `write`, then reads the state as the device sees it. The read comes after the
 * commit, on its own snapshot (`readEventState` refuses a READ COMMITTED transaction), so it
 * shows this write and whatever others committed before it (C11.6). Given a transaction
 * already (a test), both run in it.
 */
async function writeThenRead(
  db: Kysely<Database>,
  eventId: string,
  token: unknown,
  write: (trx: Kysely<Database>, legs: Leg[]) => Promise<Written>,
): Promise<PersonOutcome> {
  const written = await atomically(db, async (trx): Promise<Written> => {
    const event = await findPublicEvent(trx, eventId);
    if (event === undefined) return { ok: false, error: "eventNotFound" };
    return write(trx, eventLegs(event.retour_at));
  });
  if (!written.ok && written.error === "eventNotFound") return written;
  const state = await readEventState(db, eventId, token);
  // Deleted since the write: there is nothing left to show.
  if (state === undefined) return { ok: false, error: "eventNotFound" };
  return written.ok ? { ok: true, state } : { ok: false, error: written.error, state };
}

/** Whether `personId` was created with `token`: every change goes through here (C2.4, C7.3). */
async function isDevicePerson(trx: Kysely<Database>, eventId: string, token: unknown, personId: string) {
  if (!isPersonalToken(token)) return false;
  return devicePersonIds(token, await readTokenHolders(trx, eventId)).includes(personId);
}

/**
 * Registers a person (R1, R2): first name, number, « Aller et retour » and the tab's leg;
 * without a car on the legs of `initialLegs`, not concerned on the other.
 *
 * A well-formed token nobody holds yet is accepted (C12.3): it is the device's first
 * registration. The id is the creation id drawn by the browser: sent again with the same
 * token, the creation succeeds without writing anything (C12.4, C1.12), so that a person
 * who boarded since stays in her car; held by another token or another event, it is refused.
 */
export async function addPerson(
  db: Kysely<Database>,
  eventId: string,
  token: unknown,
  input: unknown,
): Promise<PersonOutcome> {
  const fields = fieldsOf(input);
  const validation = validatePerson({ firstName: fields.firstName, phone: fields.phone });
  if (!validation.ok) return validation;
  const { id } = fields;
  return writeThenRead(db, eventId, token, async (trx, legs) => {
    const leg = legs.find((known) => known === fields.leg);
    if (!isCreationId(id) || leg === undefined) return INVALID;
    if (!isPersonalToken(token)) return FORBIDDEN;
    const stored = await insertPerson(trx, { id, eventId, ...validation.person, tokenHash: hashToken(token) });
    if (stored === undefined || !tokenMatches(token, stored.tokenHash)) return FORBIDDEN;
    // Sent again, or twice at once (the second insert waits for the first): nothing more to write.
    if (!stored.created) return { ok: true };
    const withoutCar = initialLegs({ bothLegs: fields.bothLegs === true, leg, hasRetour: legs.includes("retour") });
    for (const placed of withoutCar) {
      await setPlacement(trx, { personId: id, eventId, leg: placed, rideId: null });
    }
    return { ok: true };
  });
}

/** Changes the first name and the number of one of the device's persons (C2.3): an empty number removes it. */
export async function updatePerson(
  db: Kysely<Database>,
  eventId: string,
  token: unknown,
  input: unknown,
): Promise<PersonOutcome> {
  const fields = fieldsOf(input);
  const validation = validatePerson({ firstName: fields.firstName, phone: fields.phone });
  if (!validation.ok) return validation;
  const { personId } = fields;
  return writeThenRead(db, eventId, token, async (trx) => {
    if (!isCreationId(personId)) return INVALID;
    if (!(await isDevicePerson(trx, eventId, token, personId))) return FORBIDDEN;
    await storePersonFields(trx, { id: personId, eventId }, validation.person);
    return { ok: true };
  });
}

/**
 * Where one of the device's persons stands on one leg, the other leg untouched (C3.5):
 * `withoutCar` covers « Je cherche une place » and « Sortir de la voiture », `notConcerned`
 * « Pas concernée ». Done twice, the second time changes nothing (C7.4). Refused for the
 * driver of a Ride on that leg (C12.8).
 */
export async function setPersonLeg(
  db: Kysely<Database>,
  eventId: string,
  token: unknown,
  input: unknown,
): Promise<PersonOutcome> {
  const fields = fieldsOf(input);
  const kind = DECLARED_KINDS.find((known) => known === fields.kind);
  const { personId } = fields;
  return writeThenRead(db, eventId, token, async (trx, legs) => {
    const leg = legs.find((known) => known === fields.leg);
    if (kind === undefined || leg === undefined || !isCreationId(personId)) return INVALID;
    if (!(await isDevicePerson(trx, eventId, token, personId))) return FORBIDDEN;
    const placement = { personId, eventId, leg };
    if (await drivesOn(trx, placement)) return { ok: false, error: "drives" };
    if (kind === "withoutCar") await setPlacement(trx, { ...placement, rideId: null });
    else await deletePlacement(trx, placement);
    return { ok: true };
  });
}
