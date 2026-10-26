import { randomUUID } from "node:crypto";
import type { Insertable, Kysely } from "kysely";
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

/**
 * For a concurrency test on accounts or sends, which no event takes with it: hands `fn` the
 * application's connection and a maker of new addresses, then deletes the accounts (their
 * sessions and sign-in links by cascade) and the sends of those addresses, even when `fn`
 * fails. When `fn` fails, its error is the one thrown.
 * Only email-sends.test.ts may commit sends in the window: its global-cap test counts them all.
 */
export async function withCommittedAddresses<T>(
  fn: (db: Kysely<Database>, address: () => string) => Promise<T>,
): Promise<T> {
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
