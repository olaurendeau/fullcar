/*
 * The personal token: what makes a person one of the device's persons, for one
 * event (docs/agents/architecture.md, "Jetons"). The browser draws it, so this
 * module uses nothing from Node (no `node:` import, no Node buffer). The server only
 * checks its form here; it keeps and compares its hash with token-hash.ts.
 * Never log a token, whole or truncated.
 */

/** 128 bits. */
export const PERSONAL_TOKEN_BYTES = 16;

const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/**
 * 22 base64url characters for exactly 16 bytes: the last one carries the last
 * 2 bits and 4 zero bits, so only A, Q, g and w are canonical. Any other last
 * character would be a second spelling of a token, or 4 bits that are not one.
 */
const FORMAT = /^[A-Za-z0-9_-]{21}[AQgw]$/;

/** Takes anything: `RegExp.test` would coerce `[token]` into a match. */
export function isPersonalToken(value: unknown): value is string {
  return typeof value === "string" && FORMAT.test(value);
}

/**
 * The token for 16 bytes from a CSPRNG (`crypto.getRandomValues` in the browser):
 * their base64url, unpadded. Throws on any other length rather than write a
 * weaker token.
 */
export function personalTokenFromBytes(bytes: Uint8Array): string {
  if (bytes.length !== PERSONAL_TOKEN_BYTES) {
    throw new RangeError(`A personal token is drawn from ${PERSONAL_TOKEN_BYTES} bytes.`);
  }
  let token = "";
  for (let at = 0; at < bytes.length; at += 3) {
    const left = bytes.length - at;
    const group = (bytes[at] << 16) | ((left > 1 ? bytes[at + 1] : 0) << 8) | (left > 2 ? bytes[at + 2] : 0);
    const characters = left >= 3 ? 4 : left + 1;
    for (let c = 0; c < characters; c++) token += BASE64URL[(group >> (18 - 6 * c)) & 0x3f];
  }
  return token;
}
