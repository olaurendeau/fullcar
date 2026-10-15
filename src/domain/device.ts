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
