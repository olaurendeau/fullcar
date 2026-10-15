/*
 * The creation id (C12.4): a uuid v4 the browser draws before it sends a
 * creation, and which becomes the primary key of the created row. Sent again,
 * the same creation hits the same key and creates nothing more. It is not a
 * token: it grants nothing. The browser draws it, so this module imports
 * nothing from Node (no `node:` import, no Node buffer).
 */

const UUID_BYTES = 16;

/** Lowercase, as Postgres writes a `uuid`, with the version 4 and RFC 4122 variant bits. */
const FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Takes anything: `RegExp.test` would coerce `[id]` into a match. */
export function isCreationId(value: unknown): value is string {
  return typeof value === "string" && FORMAT.test(value);
}

/**
 * A uuid v4 from 16 bytes of a CSPRNG (`crypto.getRandomValues` in the browser):
 * the version and variant bits are set, the 122 others are the bytes'. The bytes
 * given are not modified. Throws on any other length.
 */
export function uuidV4FromBytes(bytes: Uint8Array): string {
  if (bytes.length !== UUID_BYTES) {
    throw new RangeError(`A uuid is drawn from ${UUID_BYTES} bytes.`);
  }
  const uuid = Uint8Array.from(bytes);
  uuid[6] = (uuid[6] & 0x0f) | 0x40;
  uuid[8] = (uuid[8] & 0x3f) | 0x80;
  const hex = Array.from(uuid, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}
