import { sql, type Kysely, type Selectable } from "kysely";
import {
  CONFIRMATION_LINK_LIFETIME_MS,
  LOGIN_LINK_LIFETIME_MS,
  linkOutcome,
  type LinkKind,
  type LinkOutcome,
  type StoredLink,
} from "@/domain/account-rules";
import { newServerToken } from "@/domain/server-token";
import type { Database, EmailLinkTable } from "./schema";
import { isTokenOf, tokenKey } from "./token-key";

/*
 * The links sent by email (« Session, liens et jeton d'admin » in architecture.md), kept
 * under the SHA-256 of their token, never the token. Each serves once, even to two
 * requests at once; several unused links stay valid together. Never log a token.
 */

/** A sign-in link lands on `/e/{returnEventId}/admin`, or on `/mes-evenements` when null (OA4.4). */
export type NewLink =
  | { kind: "login"; accountId: string; returnEventId: string | null }
  | { kind: "confirmation"; eventId: string };

/** What the database keeps of a link, its token aside. */
export interface Link extends StoredLink {
  accountId: string | null;
  eventId: string | null;
  returnEventId: string | null;
}

/** What using a link gives: the link, used now, or why it cannot be used (OA5.4 to OA5.7). */
export type LinkUse = { outcome: "valid"; link: Link } | { outcome: Exclude<LinkOutcome, "valid"> };

const LIFETIME_MS = { login: LOGIN_LINK_LIFETIME_MS, confirmation: CONFIRMATION_LINK_LIFETIME_MS };

const LINK_COLUMNS = ["token_hash", "kind", "created_at", "used_at", "account_id", "event_id", "return_event_id"] as const;

function toLink(row: Pick<Selectable<EmailLinkTable>, (typeof LINK_COLUMNS)[number]>): Link {
  return {
    kind: row.kind,
    createdAt: row.created_at,
    usedAt: row.used_at,
    accountId: row.account_id,
    eventId: row.event_id,
    returnEventId: row.return_event_id,
  };
}

/** The row of a new link, its dates aside: shared with the test seeds. */
export function linkRow(link: NewLink, token: string) {
  return {
    token_hash: tokenKey(token)!,
    kind: link.kind,
    account_id: link.kind === "login" ? link.accountId : null,
    event_id: link.kind === "confirmation" ? link.eventId : null,
    return_event_id: link.kind === "login" ? link.returnEventId : null,
  };
}

/** Stores a new link, and gives its token: the only time it is anywhere but in the email. */
export async function createLink(db: Kysely<Database>, link: NewLink): Promise<string> {
  const token = newServerToken();
  await db.insertInto("email_link").values(linkRow(link, token)).execute();
  return token;
}

/** The token's link, used or not, expired or not; `null` for an unknown token or a value that is not a string. */
export async function findLink(db: Kysely<Database>, token: unknown): Promise<Link | null> {
  const key = tokenKey(token);
  if (key === null) return null;
  const row = await db.selectFrom("email_link").select(LINK_COLUMNS).where("token_hash", "=", key).executeTakeFirst();
  return row && isTokenOf(token, row.token_hash) ? toLink(row) : null;
}

/**
 * Uses the token's link on the page for links of kind `expected`, once. The link is marked
 * used in one statement, which also checks it is unused, of that kind and not expired:
 * of two requests at once, the second waits for the first's row lock, then finds the link
 * used. Whatever the reason a link is not used, the outcome comes from the domain's rule,
 * linkOutcome, on the link as committed.
 * Call it in the transaction that does what the link opens: if that fails, the link stays
 * unused.
 */
export async function useLink(db: Kysely<Database>, token: unknown, expected: LinkKind, now = new Date()): Promise<LinkUse> {
  const key = tokenKey(token);
  if (key === null) return { outcome: "invalid" };
  // Unexpired while created less than its lifetime ago: the rule of linkExpiresAt.
  const validSince = new Date(now.getTime() - LIFETIME_MS[expected]);
  const used = await db
    .updateTable("email_link")
    .set({ used_at: sql<Date>`now()` })
    .where("token_hash", "=", key)
    .where("kind", "=", expected)
    .where("used_at", "is", null)
    .where("created_at", ">", validSince)
    .returning(LINK_COLUMNS)
    .executeTakeFirst();
  if (used && isTokenOf(token, used.token_hash)) return { outcome: "valid", link: toLink(used) };
  const outcome = linkOutcome(await findLink(db, token), expected, now);
  // Unused, unexpired, yet not used: committed between the two statements. Never a link used twice.
  if (outcome === "valid") throw new Error("useLink: the link appeared after it was looked for");
  return { outcome };
}
