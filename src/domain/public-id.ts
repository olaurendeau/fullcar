import { randomBytes } from "node:crypto";
import { PUBLIC_ID_ALPHABET } from "./public-id-format";

export { PUBLIC_ID_ALPHABET, isPublicId } from "./public-id-format";

const LENGTH = 8;

/** The largest multiple of 57 a byte can reach: bytes from it up are rejected, not folded. */
const UNBIASED_LIMIT = 256 - (256 % PUBLIC_ID_ALPHABET.length);

/** A source of random bytes; `randomBytes` outside tests. */
export type RandomBytes = (size: number) => Uint8Array;

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
