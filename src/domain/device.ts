import { deviceTokensOf } from "./personal-token";
import { tokenMatches } from "./token-hash";

/** A person of the event, as far as the device is concerned: its id and its token's hash, in hex. */
export type TokenHolder = { id: string; tokenHash: string };

/**
 * The rank, from 0, of the first of `tokens` that carries `person`; nothing when none does.
 * Every token costs one constant-time comparison, with no early exit, so the time says nothing
 * of which token matched. With no token (`undefined`), one comparison is still made, then refused.
 */
function rankOf(tokens: readonly string[] | undefined, person: TokenHolder): number | undefined {
  if (tokens === undefined) {
    tokenMatches(undefined, person.tokenHash);
    return undefined;
  }
  let rank: number | undefined;
  tokens.forEach((token, at) => {
    if (tokenMatches(token, person.tokenHash) && rank === undefined) rank = at;
  });
  return rank;
}

/**
 * The device's persons: those of `persons` (all of one event) held by one of the tokens of
 * `token`, which is one token or the device's list (`deviceTokensOf`, LP5.1). Every right check
 * goes through here (C2.4, C7.3, C8.1): a device holding A and B has the persons of A and
 * those of B, nothing more.
 *
 * An event has few persons, so all of them are read and compared in memory,
 * never looked up by hash in SQL (C12.2). Every hash costs one constant-time
 * comparison per token, whatever the token; a field that reads as no token, or a malformed
 * stored hash, matches nobody, without throwing.
 */
export function devicePersonIds(token: unknown, persons: readonly TokenHolder[]): string[] {
  const tokens = deviceTokensOf(token);
  return persons.filter((person) => rankOf(tokens, person) !== undefined).map((person) => person.id);
}

/**
 * For each of the device's persons (`devicePersonIds`), her id and the rank, from 0, of the
 * first token of the list that holds her: what the page needs to tell its links apart (LP5.3).
 * Nothing else leaves: no token, no hash. `{}` for a device without person.
 */
export function deviceTokenRanks(token: unknown, persons: readonly TokenHolder[]): Record<string, number> {
  const tokens = deviceTokensOf(token);
  const ranks: Record<string, number> = {};
  for (const person of persons) {
    const rank = rankOf(tokens, person);
    if (rank !== undefined) ranks[person.id] = rank;
  }
  return ranks;
}

/**
 * Whether `ids` may be changed with `token` (RP5.4, #645): `device` when all of them are the
 * device's persons; `forbidden` when the token reads as none (malformed, absent, an empty or too long list), or when one of them is
 * held by another token, which comes first; otherwise `personGone`, with those of `ids` that
 * no person of the event holds any more, in the order asked: removed since the page showed them.
 */
export type DeviceAccess = { kind: "device" } | { kind: "forbidden" } | { kind: "personGone"; goneIds: string[] };

export function deviceAccess(token: unknown, persons: readonly TokenHolder[], ids: readonly string[]): DeviceAccess {
  if (deviceTokensOf(token) === undefined) return { kind: "forbidden" };
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
 * three of the four placement writes (`setPersonLeg`, `takeSeats`, `setBoardingStop`);
 * `undoSeats` does not call it, its writes filter on the Ride and the event. Every identity
 * write goes through `deviceAccess`.
 */
export type EventAccess = { kind: "event" } | { kind: "personGone"; goneIds: string[] };

export function eventAccess(persons: readonly { id: string }[], ids: readonly string[]): EventAccess {
  const held = new Set(persons.map((person) => person.id));
  const goneIds = ids.filter((id) => !held.has(id));
  return goneIds.length > 0 ? { kind: "personGone", goneIds } : { kind: "event" };
}
