import { randomBytes } from "node:crypto";
import type { RandomBytes } from "./public-id";

/*
 * Every token the server draws: the organiser's token, the session, and the
 * sign-in and confirmation links (docs/agents/architecture.md, "Jetons"). This
 * module is the only one that generates them; they are kept and compared as
 * every token is (token-hash.ts). Never log a token, whole or truncated.
 */

/** 128 bits. */
export const SERVER_TOKEN_BYTES = 16;

/**
 * A new token: 128 bits from a CSPRNG, in unpadded base64url (22 characters).
 * Throws if the source gives another number of bytes, rather than write a weaker token.
 */
export function newServerToken(random: RandomBytes = randomBytes): string {
  const bytes = random(SERVER_TOKEN_BYTES);
  if (bytes.length !== SERVER_TOKEN_BYTES) {
    throw new RangeError(`A server token is drawn from ${SERVER_TOKEN_BYTES} bytes.`);
  }
  return Buffer.from(bytes).toString("base64url");
}
