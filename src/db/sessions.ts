import { sql, type Kysely } from "kysely";
import { SESSION_LIFETIME_MS, sessionIsAlive } from "@/domain/account-rules";
import { newServerToken } from "@/domain/server-token";
import type { Locale } from "@/i18n/locales";
import { findAccount, type Account } from "./accounts";
import type { Database } from "./schema";
import { isTokenOf, tokenKey } from "./token-key";
import { atomically } from "./transaction";

/*
 * The organiser's sessions (« Session, liens et jeton d'admin » in architecture.md), kept
 * under the SHA-256 of their token, which comes in a request body as `unknown`. A session
 * lives 90 days after its last visit (OA9.6). Never log a token, nor an address.
 */

/** Opens one more session on the account (OA9.1), and gives its token, the only time it leaves the server. */
export async function openSession(db: Kysely<Database>, accountId: string): Promise<string> {
  const token = newServerToken();
  await db.insertInto("session").values({ token_hash: tokenKey(token)!, account_id: accountId }).execute();
  return token;
}

/** The account of the token's session; nothing for an unknown token, or a session ended 90 days after its last visit. */
export async function findSession(db: Kysely<Database>, token: unknown, now = new Date()): Promise<Account | undefined> {
  const key = tokenKey(token);
  if (key === null) return undefined;
  const columns = ["token_hash", "account_id", "last_visit_at"] as const;
  const session = await db.selectFrom("session").select(columns).where("token_hash", "=", key).executeTakeFirst();
  if (!session || !isTokenOf(token, session.token_hash) || !sessionIsAlive(session.last_visit_at, now)) {
    return undefined;
  }
  return findAccount(db, session.account_id);
}

/**
 * A page load with the session (OA9.6, OA9.7): the session slides, and the account notes
 * the visit and its language, in one transaction. An ended session stays ended, and the
 * account is left as it was: nothing for it, as for an unknown token.
 */
export async function visitSession(
  db: Kysely<Database>,
  token: unknown,
  locale: Locale,
  now: Date = new Date(),
): Promise<Account | undefined> {
  const key = tokenKey(token);
  if (key === null) return undefined;
  // Alive while the last visit is less than the lifetime ago: the rule of sessionIsAlive.
  const aliveSince = new Date(now.getTime() - SESSION_LIFETIME_MS);
  return atomically(db, async (trx) => {
    const session = await trx
      .updateTable("session")
      .set({ last_visit_at: sql<Date>`now()` })
      .where("token_hash", "=", key)
      .where("last_visit_at", ">", aliveSince)
      .returning(["token_hash", "account_id"])
      .executeTakeFirst();
    if (!session || !isTokenOf(token, session.token_hash)) return undefined;
    const visit = { last_visit_at: sql<Date>`now()`, locale };
    await trx.updateTable("account").set(visit).where("id", "=", session.account_id).execute();
    return findAccount(trx, session.account_id);
  });
}

/** Ends the token's session (« Se déconnecter »), and says whether there was one. */
export async function closeSession(db: Kysely<Database>, token: unknown): Promise<boolean> {
  const key = tokenKey(token);
  if (key === null) return false;
  const closed = await db.deleteFrom("session").where("token_hash", "=", key).returning("token_hash").executeTakeFirst();
  return closed !== undefined && isTokenOf(token, closed.token_hash);
}
