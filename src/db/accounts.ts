import type { Kysely } from "kysely";
import { SESSION_LIFETIME_MS } from "@/domain/account-rules";
import type { Locale } from "@/i18n/locales";
import { lockAddress } from "./email-sends";
import type { Database } from "./schema";
import { isTokenOf, tokenKey } from "./token-key";
import { atomically } from "./transaction";

/*
 * The organiser's account (epic #581). An address is written as
 * src/domain/email-address.ts reads it: the caller gives it so, and the table's checks
 * refuse any other writing. Never log an address.
 */

export interface Account {
  id: string;
  email: string;
  /** The language of the last visit with a session: the inactivity warning's (OA3.1). */
  locale: Locale;
  /** The last visit with a session, which measures inactivity (OA9.7). */
  lastVisitAt: Date;
  /** When the inactivity warning went out, if it did. */
  warnedAt: Date | null;
}

const ACCOUNT_COLUMNS = ["id", "email", "locale", "last_visit_at", "warned_at"] as const;

function toAccount(row: { id: string; email: string; locale: Locale; last_visit_at: Date; warned_at: Date | null }) {
  return { id: row.id, email: row.email, locale: row.locale, lastVisitAt: row.last_visit_at, warnedAt: row.warned_at };
}

/** The account of the address; nothing for an address without an account, which a sign-in request leaves so (OA3.5). */
export async function findAccountByEmail(db: Kysely<Database>, email: string): Promise<Account | undefined> {
  const row = await db.selectFrom("account").select(ACCOUNT_COLUMNS).where("email", "=", email).executeTakeFirst();
  return row && toAccount(row);
}

/** The account of the id; nothing for an unknown one. */
export async function findAccount(db: Kysely<Database>, id: string): Promise<Account | undefined> {
  const row = await db.selectFrom("account").select(ACCOUNT_COLUMNS).where("id", "=", id).executeTakeFirst();
  return row && toAccount(row);
}

/**
 * The account of the address, created in `locale` when there is none: what a confirmation
 * attaches its event to (OA5.3). An existing account is given as it is: one address, one
 * account.
 */
export async function accountForEmail(db: Kysely<Database>, email: string, locale: Locale): Promise<Account> {
  const created = await db
    .insertInto("account")
    .values({ email, locale })
    .onConflict((conflict) => conflict.constraint("account_email_unique").doNothing())
    .returning(ACCOUNT_COLUMNS)
    .executeTakeFirst();
  if (created) return toAccount(created);
  const existing = await findAccountByEmail(db, email);
  if (!existing) throw new Error("accountForEmail: the account of the address was neither created nor found");
  return existing;
}

/**
 * Locks the sessions of the account, in the order of their keys, until the transaction ends:
 * « Se déconnecter » and a visit take a session first, and two deletions of one account take
 * the same sessions in the same order. Gives their keys.
 */
async function lockSessions(db: Kysely<Database>, accountId: string): Promise<Buffer[]> {
  const rows = await db
    .selectFrom("session")
    .select("token_hash")
    .where("account_id", "=", accountId)
    .orderBy("token_hash")
    .forUpdate()
    .execute();
  return rows.map((row) => row.token_hash);
}

/**
 * « Supprimer mon compte » (OA9.3 to OA9.5), for the session whose token `session` is, as it
 * came in a request's body: the account is erased as `eraseAccount` says, and `adminTokens`,
 * the admin tokens this browser keeps, are revoked with it, as « Se déconnecter » revokes them.
 * Says whether it was: not for an unknown token, a value that is no token, a session ended 90
 * days after its last visit, nor one closed meanwhile by another tab. The tokens are only
 * compared, never answered, kept nor logged.
 */
export async function deleteAccount(
  db: Kysely<Database>,
  session: unknown,
  adminTokens: readonly unknown[],
  now: Date = new Date(),
): Promise<boolean> {
  const key = tokenKey(session);
  if (key === null) return false;
  // Alive while the last visit is less than the lifetime ago: the rule of sessionIsAlive.
  const aliveSince = new Date(now.getTime() - SESSION_LIFETIME_MS);
  return atomically(db, async (trx) => {
    const found = await trx
      .selectFrom("session")
      .select(["token_hash", "account_id"])
      .where("token_hash", "=", key)
      .where("last_visit_at", ">", aliveSince)
      .executeTakeFirst();
    if (!found || !isTokenOf(session, found.token_hash)) return false;
    const held = await lockSessions(trx, found.account_id);
    // Closed, or its account deleted, while this waited for the sessions: nothing left to delete.
    if (!held.some((each) => each.equals(key))) return false;
    return eraseHeld(trx, found.account_id, adminTokens);
  });
}

/**
 * Erases the account by its id (OA9.5, and OA9.7's inactivity deletion): says whether there
 * was one. One transaction, all or nothing.
 */
export async function eraseAccount(db: Kysely<Database>, accountId: string, adminTokens: readonly unknown[]): Promise<boolean> {
  return atomically(db, async (trx) => {
    await lockSessions(trx, accountId);
    return eraseHeld(trx, accountId, adminTokens);
  });
}

/**
 * What erasing an account comes to, under the lock of its sessions (OA9.5, decision 4 on #581):
 * its anonymised events are deleted; its other events stay open, without account and without
 * admin token, as are the events whose token `adminTokens` holds; the pending events created
 * elsewhere with its address lose that address and their confirmation links; its sign-in links,
 * its sends and its sessions are deleted; then the account, so that its address is in no table.
 *
 * Lock order, as « Se déconnecter » and `editEvent` take it: the sessions (caller), then the
 * events by id, then the links by key, then the address, then the account. An event confirmed
 * meanwhile is left by the account's `SET NULL`, orphan, and its admin token is revoked under the
 * account's lock, just before it goes; so is one created with a session meanwhile (#904).
 */
async function eraseHeld(db: Kysely<Database>, accountId: string, adminTokens: readonly unknown[]): Promise<boolean> {
  const account = await db.selectFrom("account").select("email").where("id", "=", accountId).executeTakeFirst();
  if (!account) return false;
  const { email } = account;
  const keys = adminTokens.map(tokenKey).filter((key): key is Buffer => key !== null);

  const events = await db
    .selectFrom("event")
    .select(["id", "account_id", "anonymised_at", "pending_email", "admin_token_hash"])
    .where((eb) =>
      eb.or([
        eb("account_id", "=", accountId),
        eb("pending_email", "=", email),
        ...(keys.length > 0 ? [eb("admin_token_hash", "in", keys)] : []),
      ]),
    )
    .orderBy("id")
    .forNoKeyUpdate()
    .execute();
  const own = events.filter((event) => event.account_id === accountId);
  const ended = own.filter((event) => event.anonymised_at !== null).map((event) => event.id);
  const open = own.filter((event) => event.anonymised_at === null).map((event) => event.id);
  const pending = events.filter((event) => event.account_id !== accountId && event.pending_email === email).map((event) => event.id);
  const revoked = events
    .filter((event) => event.anonymised_at === null)
    .filter((event) => event.account_id === accountId || keys.some((key) => event.admin_token_hash?.equals(key)))
    .map((event) => event.id);

  if (revoked.length > 0) await db.updateTable("event").set({ admin_token_hash: null }).where("id", "in", revoked).execute();
  if (open.length > 0) await db.updateTable("event").set({ account_id: null }).where("id", "in", open).execute();
  if (pending.length > 0) await db.updateTable("event").set({ pending_email: null }).where("id", "in", pending).execute();
  if (ended.length > 0) await db.deleteFrom("event").where("id", "in", ended).execute();

  // The links in the order of their keys, locked before they go: the daily clean-up deletes links too (40P01).
  const links = await db
    .selectFrom("email_link")
    .select("token_hash")
    .where((eb) => eb.or([eb("account_id", "=", accountId), ...(pending.length > 0 ? [eb("event_id", "in", pending)] : [])]))
    .orderBy("token_hash")
    .forUpdate()
    .execute();
  if (links.length > 0) {
    await db.deleteFrom("email_link").where("token_hash", "in", links.map((link) => link.token_hash)).execute();
  }

  await lockAddress(db, email);
  await db.deleteFrom("email_send").where("email", "=", email).execute();
  await db.deleteFrom("session").where("account_id", "=", accountId).execute();

  // An event created with a session meanwhile (#904) writes its `account_id` under a key share of
  // the account's row, after the read of the events above. The lock waits for it to commit, and
  // it is revoked like the others; one that comes after is refused by the foreign key.
  await db.selectFrom("account").select("id").where("id", "=", accountId).forUpdate().execute();
  await db.updateTable("event").set({ admin_token_hash: null }).where("account_id", "=", accountId).execute();
  await db.deleteFrom("account").where("id", "=", accountId).execute();
  return true;
}
