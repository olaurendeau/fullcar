import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { RandomBytes } from "./public-id";

/*
 * The organiser's token: the only identity there is, so it is the critical piece
 * (docs/agents/architecture.md, "Jetons"). This module is the only one that
 * generates, hashes or compares it. Never log a token, whole or truncated.
 */

const TOKEN_BYTES = 16; // 128 bits
const STORED_HASH = /^[0-9a-f]{64}$/;

/** A new token: 128 bits from a CSPRNG, in base64url (22 characters). */
export function newAdminToken(random: RandomBytes = randomBytes): string {
  return Buffer.from(random(TOKEN_BYTES)).toString("base64url");
}

/** What the database keeps instead of the token: its SHA-256, in lowercase hex. */
export function hashAdminToken(token: string): string {
  return digest(token).toString("hex");
}

/**
 * Whether `token` is the one whose hash is `storedHash`, in constant time.
 * Both sides are always 32 bytes, so the comparison never depends on where
 * the token differs. Never throws: a token that is not a string, or a stored
 * hash that is not a SHA-256 in hex, still costs a comparison, then is refused.
 */
export function adminTokenMatches(token: unknown, storedHash: unknown): boolean {
  const isToken = typeof token === "string";
  const candidate = digest(isToken ? token : "");
  const wellFormed = typeof storedHash === "string" && STORED_HASH.test(storedHash);
  const expected = wellFormed ? Buffer.from(storedHash, "hex") : candidate;
  return timingSafeEqual(candidate, expected) && isToken && wellFormed;
}

function digest(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}
