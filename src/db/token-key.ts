import { hashToken, tokenMatches } from "@/domain/token-hash";

/**
 * The key of the session or link a token opens: its SHA-256 as token-hash.ts makes it, in
 * 32 bytes; `null` for a value that is not a string, from a forged request. Never log a
 * token, whole or truncated, nor its key.
 */
export function tokenKey(token: unknown): Buffer | null {
  return typeof token === "string" ? Buffer.from(hashToken(token), "hex") : null;
}

/** Whether the row found under the key is the token's, compared in constant time like every token. */
export function isTokenOf(token: unknown, storedHash: Buffer): boolean {
  return tokenMatches(token, storedHash.toString("hex"));
}
