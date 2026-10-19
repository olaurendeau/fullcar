/*
 * The shape of an event's public id, apart from its generation (public-id.ts) so the
 * browser can check an id: this module uses nothing from Node.
 */

/**
 * The public id of an event, in `/e/{id}`: 8 symbols from 57, about 46.7 bits.
 * Not a token (it grants no write), but never sequential nor guessable.
 * No `0 O 1 l I`: the id is read aloud and copied by hand. Case-sensitive.
 */
export const PUBLIC_ID_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const FORMAT = /^[2-9A-HJ-NP-Za-km-z]{8}$/;

/** Takes anything: `RegExp.test` would coerce `["23456789"]` into a match. */
export function isPublicId(value: unknown): value is string {
  return typeof value === "string" && FORMAT.test(value);
}
