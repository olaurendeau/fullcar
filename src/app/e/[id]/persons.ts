import type { Kysely } from "kysely";
import { insertPerson, lockPersons, readTokenHolders, updatePerson as storePersonFields } from "@/db/persons";
import { deletePlacement, setPlacement } from "@/db/placements";
import { findDrivenRide } from "@/db/rides";
import type { Database } from "@/db/schema";
import { atomically } from "@/db/transaction";
import { isCreationId } from "@/domain/creation-id";
import { deviceAccess } from "@/domain/device";
import { initialLegs, LEGS, type Leg } from "@/domain/leg";
import { validatePerson, validatePersonChange, type PersonErrors, type PersonField } from "@/domain/person";
import { isPersonalToken } from "@/domain/personal-token";
import { hashToken, tokenMatches } from "@/domain/token-hash";
import { readEventState, type DeviceState } from "./event-state";
import { lockLegs } from "./retour";

/*
 * Registering and changing a person (epic #66, R1 to R3, R7). Every input is `unknown`: a
 * forged request gets a refusal or field errors, never an exception. The personal token is
 * only hashed or compared, never logged nor returned.
 */

/** Why nothing was written, for the view to translate. */
export type PersonRefusal =
  /** No such event, or a malformed id. */
  | "eventNotFound"
  /** The event is anonymised (#588): before any other refusal. */
  | "eventEnded"
  /** The token is malformed or absent, the person is not the device's, or the id is someone else's. */
  | "forbidden"
  /** With a well-formed token, no person of the event has the id: removed since the page showed her (RP5.4). */
  | "personGone"
  /** The person drives on that leg: she has no Placement there to change. */
  | "drives"
  /** Something only a forged request sends: an id, a leg or a state that is not one. */
  | "invalid"
  /** The write is on the retour, and the event no longer has one (decision 40). */
  | "noRetour";

type Refused = Exclude<PersonRefusal, "eventNotFound">;

export type PersonOutcome =
  | { ok: true; state: DeviceState }
  | { ok: false; errors: PersonErrors; first: PersonField }
  | { ok: false; error: "eventNotFound" }
  | { ok: false; error: Refused; state: DeviceState };

type Written = { ok: true } | { ok: false; error: "eventNotFound" } | { ok: false; error: Refused };

const FORBIDDEN = { ok: false, error: "forbidden" } as const;
const PERSON_GONE = { ok: false, error: "personGone" } as const;
const INVALID = { ok: false, error: "invalid" } as const;
const NO_RETOUR = { ok: false, error: "noRetour" } as const;

/** What `setPersonLeg` may make of a person on a leg: the two states she declares herself. */
const DECLARED_KINDS = ["withoutCar", "notConcerned"] as const;

function fieldsOf(input: unknown): Record<string, unknown> {
  return typeof input === "object" && input !== null ? { ...input } : {};
}

/**
 * Commits `write`, then reads the state as the device sees it. The write starts with the
 * Event's lock (lock order: Event, then Ride, then Person) and is given the event's legs.
 * The read comes after the commit, on its own snapshot (`readEventState` refuses a READ
 * COMMITTED transaction), so it shows this write and whatever others committed before it
 * (C11.6). Given a transaction already (a test), both run in it.
 */
async function writeThenRead(
  db: Kysely<Database>,
  eventId: string,
  token: unknown,
  write: (trx: Kysely<Database>, legs: Leg[]) => Promise<Written>,
): Promise<PersonOutcome> {
  const written = await atomically(db, async (trx): Promise<Written> => {
    const locked = await lockLegs(trx, eventId, []);
    if (!locked.ok) return { ok: false, error: locked.error === "eventEnded" ? "eventEnded" : "eventNotFound" };
    return write(trx, locked.legs);
  });
  if (!written.ok && written.error === "eventNotFound") return written;
  const state = await readEventState(db, eventId, token);
  // Deleted since the write: there is nothing left to show.
  if (state === undefined) return { ok: false, error: "eventNotFound" };
  return written.ok ? { ok: true, state } : { ok: false, error: written.error, state };
}

/**
 * Why `personId` may not be changed with `token`, nothing when she is the device's: every change
 * goes through here (C2.4, C7.3). `forbidden` for another token's, `personGone` when no person of
 * the event has the id any more (RP5.4).
 */
async function refusalFor(trx: Kysely<Database>, eventId: string, token: unknown, personId: string) {
  if (!isPersonalToken(token)) return FORBIDDEN;
  const access = deviceAccess(token, await readTokenHolders(trx, eventId), [personId]);
  return access.kind === "device" ? undefined : access.kind === "forbidden" ? FORBIDDEN : PERSON_GONE;
}

/**
 * Registers a person (R1, R2): first name, number, « Aller et retour » and the tab's leg;
 * without a car on the legs of `initialLegs`, not concerned on the other. Either of them on
 * a retour the event no longer has is refused by `noRetour` (M7.8): the page, which still
 * showed it, keeps its form for the aller alone.
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
    const leg = LEGS.find((known) => known === fields.leg);
    if (!isCreationId(id) || leg === undefined) return INVALID;
    const bothLegs = fields.bothLegs === true;
    if (!legs.includes(leg) || (bothLegs && !legs.includes("retour"))) return NO_RETOUR;
    if (!isPersonalToken(token)) return FORBIDDEN;
    const stored = await insertPerson(trx, { id, eventId, ...validation.person, tokenHash: hashToken(token) });
    if (stored === undefined || !tokenMatches(token, stored.tokenHash)) return FORBIDDEN;
    // Sent again, or twice at once (the second insert waits for the first): nothing more to write.
    if (!stored.created) return { ok: true };
    const withoutCar = initialLegs({ bothLegs, leg, hasRetour: legs.includes("retour") });
    for (const placed of withoutCar) {
      await setPlacement(trx, { personId: id, eventId, leg: placed, rideId: null });
    }
    return { ok: true };
  });
}

/**
 * Changes the first name and the number of one of the device's persons (C2.3): an empty number
 * removes it, and a field left out stays as it is (`validatePersonChange`).
 */
export async function updatePerson(
  db: Kysely<Database>,
  eventId: string,
  token: unknown,
  input: unknown,
): Promise<PersonOutcome> {
  const fields = fieldsOf(input);
  const validation = validatePersonChange({ firstName: fields.firstName, phone: fields.phone });
  if (!validation.ok) return validation;
  const { personId } = fields;
  return writeThenRead(db, eventId, token, async (trx) => {
    if (!isCreationId(personId)) return INVALID;
    const refused = await refusalFor(trx, eventId, token, personId);
    if (refused) return refused;
    // Removed after the read, while the update waited for her row: no row is left to update.
    const { change } = validation;
    if (Object.keys(change).length > 0 && !(await storePersonFields(trx, { id: personId, eventId }, change))) return PERSON_GONE;
    return { ok: true };
  });
}

/**
 * Where one of the device's persons stands on one leg, the other leg untouched (C3.5):
 * `withoutCar` covers « Je cherche une place » and « Sortir de la voiture », `notConcerned`
 * « Pas concernée ». Done twice, the second time changes nothing (C7.4). Refused for the
 * driver of a Ride on that leg (C12.8), and on a retour the event no longer has (M7.3).
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
    const leg = LEGS.find((known) => known === fields.leg);
    if (kind === undefined || leg === undefined || !isCreationId(personId)) return INVALID;
    if (!legs.includes(leg)) return NO_RETOUR;
    const refused = await refusalFor(trx, eventId, token, personId);
    if (refused) return refused;
    // Her Person locked (lock order: Event, then Person), no removal can take her away meanwhile;
    // removed after the read, while this waited, she is not there to place (RP5.4).
    if ((await lockPersons(trx, eventId, [personId])).length === 0) return PERSON_GONE;
    const placement = { personId, eventId, leg };
    if ((await findDrivenRide(trx, { driverId: personId, eventId, leg })) !== undefined) {
      return { ok: false, error: "drives" };
    }
    if (kind === "withoutCar") await setPlacement(trx, { ...placement, rideId: null });
    else await deletePlacement(trx, placement);
    return { ok: true };
  });
}
