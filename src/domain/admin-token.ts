import { randomBytes } from "node:crypto";
import type { RandomBytes } from "./public-id";

/*
 * The organiser's token: the only identity there is, so it is the critical piece
 * (docs/agents/architecture.md, "Jetons"). This module is the only one that
 * generates it; its hash and comparison are those of every token (token-hash.ts).
 * Never log a token, whole or truncated.
 */

const TOKEN_BYTES = 16; // 128 bits

/** A new token: 128 bits from a CSPRNG, in base64url (22 characters). */
export function newAdminToken(random: RandomBytes = randomBytes): string {
  return Buffer.from(random(TOKEN_BYTES)).toString("base64url");
}

export {
  /** What the database keeps instead of the token: its SHA-256, in lowercase hex. */
  hashToken as hashAdminToken,
  /** Whether `token` is the one whose hash is `storedHash`, in constant time. Never throws. */
  tokenMatches as adminTokenMatches,
} from "./token-hash";
