/*
 * The organiser's token: the critical piece (docs/agents/architecture.md,
 * "Jetons"). It is drawn like every server token
 * (server-token.ts), and kept and compared like every token (token-hash.ts).
 * Never log a token, whole or truncated.
 */

export {
  /** A new token: 128 bits from a CSPRNG, in base64url (22 characters). */
  newServerToken as newAdminToken,
} from "./server-token";

export {
  /** What the database keeps instead of the token: its SHA-256, in lowercase hex. */
  hashToken as hashAdminToken,
  /** Whether `token` is the one whose hash is `storedHash`, in constant time. Never throws. */
  tokenMatches as adminTokenMatches,
} from "./token-hash";
