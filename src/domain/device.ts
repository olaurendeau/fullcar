import { isPersonalToken } from "./personal-token";
import { tokenMatches } from "./token-hash";

/** A person of the event, as far as the device is concerned: its id and its token's hash, in hex. */
export type TokenHolder = { id: string; tokenHash: string };

/**
 * The device's persons: those of `persons` (all of one event) created with
 * `token`. Every right check goes through here (C2.4, C7.3, C8.1).
 *
 * An event has few persons, so all of them are read and compared in memory,
 * never looked up by hash in SQL (C12.2). Every hash costs one constant-time
 * comparison, whatever the token; a malformed token, or a malformed stored hash,
 * matches nobody, without throwing.
 */
export function devicePersonIds(token: unknown, persons: readonly TokenHolder[]): string[] {
  const wellFormed = isPersonalToken(token);
  const ids: string[] = [];
  for (const person of persons) {
    if (tokenMatches(token, person.tokenHash) && wellFormed) ids.push(person.id);
  }
  return ids;
}

/**
 * Whether `ids` may be changed with `token` (RP5.4, #645): `device` when all of them are the
 * device's persons; `forbidden` when the token is malformed or absent, or when one of them is
 * held by another token, which comes first; otherwise `personGone`, with those of `ids` that
 * no person of the event holds any more, in the order asked: removed since the page showed them.
 */
export type DeviceAccess = { kind: "device" } | { kind: "forbidden" } | { kind: "personGone"; goneIds: string[] };

export function deviceAccess(token: unknown, persons: readonly TokenHolder[], ids: readonly string[]): DeviceAccess {
  if (!isPersonalToken(token)) return { kind: "forbidden" };
  const mine = new Set(devicePersonIds(token, persons));
  const held = new Set(persons.map((person) => person.id));
  if (ids.some((id) => held.has(id) && !mine.has(id))) return { kind: "forbidden" };
  const goneIds = ids.filter((id) => !held.has(id));
  return goneIds.length > 0 ? { kind: "personGone", goneIds } : { kind: "device" };
}

/**
 * Whether `ids` may be placed (epic #973): `event` when all of them are persons of the event,
 * whoever holds them and with or without a token; otherwise `personGone`, with those no person
 * of the event has any more, in the order asked: removed since the page showed them. Used by
 * the four placement writes only; every identity write goes through `deviceAccess`.
 */
export type EventAccess = { kind: "event" } | { kind: "personGone"; goneIds: string[] };

export function eventAccess(persons: readonly { id: string }[], ids: readonly string[]): EventAccess {
  const held = new Set(persons.map((person) => person.id));
  const goneIds = ids.filter((id) => !held.has(id));
  return goneIds.length > 0 ? { kind: "personGone", goneIds } : { kind: "event" };
}
