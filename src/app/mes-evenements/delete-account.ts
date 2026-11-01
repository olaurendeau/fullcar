import type { Kysely } from "kysely";
import { deleteAccount } from "@/db/accounts";
import { errorCode } from "@/db/failure";
import type { Database } from "@/db/schema";
import { MAX_ADMIN_TOKENS } from "./sign-out";

/** What « Supprimer mon compte » answers: deleted, or nothing to delete for that session. Never a token. */
export type DeleteAccountAnswer = { deleted: boolean };

/** Postgres's SQLSTATE for a deadlock it detected and broke, which a second try does not meet again. */
const DEADLOCK = "SQLSTATE 40P01";

/**
 * « Supprimer mon compte » (OA9.3 to OA9.5): the account of the session whose token `session`
 * is, in one transaction, with the admin tokens this browser keeps revoked. Those beyond
 * MAX_ADMIN_TOKENS are ignored. A deadlock (40P01) with the daily clean-up of the links, or with
 * `confirmAgain` (pending-email.ts: it locks an event then the address, `clearLateAddress` the
 * reverse, #986), is tried once more. The tokens are only compared, never answered, kept nor logged.
 */
export async function deleteAccountOf(db: Kysely<Database>, session: unknown, adminTokens: unknown): Promise<DeleteAccountAnswer> {
  const tokens = Array.isArray(adminTokens) ? adminTokens.slice(0, MAX_ADMIN_TOKENS) : [];
  try {
    return { deleted: await deleteAccount(db, session, tokens) };
  } catch (error) {
    if (errorCode(error) !== DEADLOCK) throw error;
    return { deleted: await deleteAccount(db, session, tokens) };
  }
}
