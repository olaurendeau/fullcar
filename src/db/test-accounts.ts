import { randomUUID } from "node:crypto";
import type { Insertable, Kysely } from "kysely";
import pg from "pg";
import { newServerToken } from "@/domain/server-token";
import { getDb } from "./client";
import { linkRow, type NewLink } from "./email-links";
import type { AccountTable, Database, EmailSendTable } from "./schema";
import { tokenKey } from "./token-key";

/** A new address, as email-address.ts writes it: each test its own, since a concurrency test commits. */
export function anAddress(): string {
  return `camille-${randomUUID()}@exemple.fr`;
}

/** Stores an account, with a new address in French unless `fields` says otherwise, and gives its id. */
export async function seedAccount(db: Kysely<Database>, fields: Partial<Insertable<AccountTable>> = {}): Promise<string> {
  const { id } = await db
    .insertInto("account")
    .values({ email: anAddress(), locale: "fr", ...fields })
    .returning("id")
    .executeTakeFirstOrThrow();
  return id;
}

/** Stores a session of the account, opened and visited now unless dates in the past are given, and gives its token. */
export async function seedSession(
  db: Kysely<Database>,
  accountId: string,
  dates: { createdAt?: Date; lastVisitAt?: Date } = {},
): Promise<string> {
  const token = newServerToken();
  await db
    .insertInto("session")
    .values({ token_hash: tokenKey(token)!, account_id: accountId, created_at: dates.createdAt, last_visit_at: dates.lastVisitAt })
    .execute();
  return token;
}

/** Stores a link, made now and unused unless said otherwise, and gives its token. */
export async function seedLink(
  db: Kysely<Database>,
  link: NewLink,
  dates: { createdAt?: Date; usedAt?: Date } = {},
): Promise<string> {
  const token = newServerToken();
  await db
    .insertInto("email_link")
    .values({ ...linkRow(link, token), created_at: dates.createdAt, used_at: dates.usedAt ?? null })
    .execute();
  return token;
}

/** Stores `count` sends, to one address or to `email(n)`, sent now unless `sentAt` says otherwise. No limit is counted. */
export async function seedSends(
  db: Kysely<Database>,
  count: number,
  sends: { kind: EmailSendTable["kind"]; email: string | ((n: number) => string); eventId?: string | null; sentAt?: Date },
): Promise<void> {
  if (count === 0) return;
  const { kind, email, eventId = null, sentAt } = sends;
  const rows = Array.from({ length: count }, (_, n) => ({
    kind,
    email: typeof email === "string" ? email : email(n),
    event_id: eventId,
    sent_at: sentAt,
  }));
  await db.insertInto("email_send").values(rows).execute();
}

/** The session lock that the tests committing sends take in turn, apart from the application's. */
const COMMITTED_SENDS_LOCK = 5949;

/**
 * Runs `fn` while no other test file commits sends: the global-cap test of email-sends.test.ts
 * counts every committed send of the window. On a connection of its own, outside the pool,
 * whose end releases the lock.
 */
async function aloneCommittingSends<T>(fn: () => Promise<T>): Promise<T> {
  const holder = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await holder.connect();
  try {
    await holder.query("select pg_advisory_lock($1::int, 0)", [COMMITTED_SENDS_LOCK]);
    return await fn();
  } finally {
    await holder.end().catch(() => {});
  }
}

/**
 * For a concurrency test on accounts or sends, which no event takes with it: hands `fn` the
 * application's connection and a maker of new addresses, then deletes the accounts (their
 * sessions and sign-in links by cascade) and the sends of those addresses, even when `fn`
 * fails. When `fn` fails, its error is the one thrown. Never nested: the tests that commit
 * sends run one at a time, since the global-cap test counts them all.
 */
export async function withCommittedAddresses<T>(
  fn: (db: Kysely<Database>, address: () => string) => Promise<T>,
): Promise<T> {
  return aloneCommittingSends(() => committedAddresses(fn));
}

async function committedAddresses<T>(fn: (db: Kysely<Database>, address: () => string) => Promise<T>): Promise<T> {
  const db = getDb();
  const given: string[] = [];
  const address = () => given[given.push(anAddress()) - 1]!;
  const remove = async () => {
    if (given.length === 0) return;
    await db.deleteFrom("email_send").where("email", "in", given).execute();
    await db.deleteFrom("account").where("email", "in", given).execute();
  };
  let result: T;
  try {
    result = await fn(db, address);
  } catch (error) {
    await remove().catch(() => {});
    throw error;
  }
  await remove();
  return result;
}
