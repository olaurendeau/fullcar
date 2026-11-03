import type { Kysely } from "kysely";
import { revokeAdminTokens } from "@/db/events";
import type { Database } from "@/db/schema";
import { closeSession } from "@/db/sessions";
import { atomically } from "@/db/transaction";

/**
 * The most admin tokens one sign-out revokes: far more than a browser creates events, so that
 * a forged body of thousands costs no more than a browser's. Those beyond are ignored.
 */
export const MAX_ADMIN_TOKENS = 200;

/** What « Se déconnecter » answers: always signed out, whatever the session was. Never a token. */
export type SignOutAnswer = { signedOut: true };

/**
 * « Se déconnecter » (OA9.1, decision 12 of organizer-account): this browser's session ends,
 * and the admin tokens it sends are revoked, in one transaction. Another session of the account
 * stays. A session already ended, or none, is no failure: the browser forgets what it sent all
 * the same. The tokens are only compared, never answered, kept nor logged.
 */
export async function signOutBrowser(db: Kysely<Database>, session: unknown, adminTokens: unknown): Promise<SignOutAnswer> {
  const tokens = Array.isArray(adminTokens) ? adminTokens.slice(0, MAX_ADMIN_TOKENS) : [];
  await atomically(db, async (trx) => {
    await closeSession(trx, session);
    await revokeAdminTokens(trx, tokens);
  });
  return { signedOut: true };
}
