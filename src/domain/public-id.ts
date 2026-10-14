import { randomBytes } from "node:crypto";

/**
 * The public id of an event, in `/e/{id}`: 8 symbols from 57, about 46.7 bits.
 * Not a token (it grants no write), but never sequential nor guessable.
 * No `0 O 1 l I`: the id is read aloud and copied by hand. Case-sensitive.
 */
export const PUBLIC_ID_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const LENGTH = 8;
const FORMAT = /^[2-9A-HJ-NP-Za-km-z]{8}$/;

/** The largest multiple of 57 a byte can reach: bytes from it up are rejected, not folded. */
const UNBIASED_LIMIT = 256 - (256 % PUBLIC_ID_ALPHABET.length);

/** A source of random bytes; `randomBytes` outside tests. */
export type RandomBytes = (size: number) => Uint8Array;

/** Takes anything: `RegExp.test` would coerce `["23456789"]` into a match. */
export function isPublicId(value: unknown): value is string {
  return typeof value === "string" && FORMAT.test(value);
}

/**
 * Draws an id by rejection sampling: a byte maps to a symbol only below
 * UNBIASED_LIMIT, so every symbol is equally likely.
 */
export function generatePublicId(random: RandomBytes = randomBytes): string {
  let id = "";
  while (id.length < LENGTH) {
    for (const byte of random(2 * LENGTH)) {
      if (byte >= UNBIASED_LIMIT) continue;
      id += PUBLIC_ID_ALPHABET[byte % PUBLIC_ID_ALPHABET.length];
      if (id.length === LENGTH) break;
    }
  }
  return id;
}
