import { createHash, timingSafeEqual } from "node:crypto";

/*
 * How a token is kept and checked, for both the organiser's token and the
 * personal token (docs/agents/architecture.md, "Jetons"): its SHA-256 in the
 * database, compared in constant time. This is the only constant-time comparison
 * in the code. Never log a token, whole or truncated.
 */

const STORED_HASH = /^[0-9a-f]{64}$/;

/** What the database keeps instead of the token: its SHA-256, in lowercase hex. */
export function hashToken(token: string): string {
  return digest(token).toString("hex");
}

/**
 * Whether `token` is the one whose hash is `storedHash`, in constant time.
 * Both sides are always 32 bytes, so the comparison never depends on where
 * the token differs. Never throws: a token that is not a string, or a stored
 * hash that is not a SHA-256 in hex, still costs a comparison, then is refused.
 */
export function tokenMatches(token: unknown, storedHash: unknown): boolean {
  const isToken = typeof token === "string";
  const candidate = digest(isToken ? token : "");
  const wellFormed = typeof storedHash === "string" && STORED_HASH.test(storedHash);
  const expected = wellFormed ? Buffer.from(storedHash, "hex") : candidate;
  return timingSafeEqual(candidate, expected) && isToken && wellFormed;
}

function digest(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}
