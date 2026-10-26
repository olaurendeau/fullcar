import type { Kysely } from "kysely";
import type { Locale } from "@/i18n/locales";
import type { Database } from "./schema";

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
