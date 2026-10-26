import { sql, type Kysely } from "kysely";
import { SEND_WINDOW_MS, sendLimitReached, type SendLimit } from "@/domain/send-limits";
import { lockEvent } from "./events";
import type { Database } from "./schema";
import { atomically } from "./transaction";

/*
 * The emails we try to send, counted for the limits of send-limits.ts (« L'adresse après
 * l'Event » in docs/agents/architecture.md). The inactivity warnings (#616) are not sends
 * here: they count in no limit. Never log an address.
 */

/** A confirmation email for a pending event, or the answer to a sign-in request (OA3.5). */
export type SendRequest = { kind: "confirmation"; eventId: string; email: string } | { kind: "login"; email: string };

/** The send recorded, the limit that stops it, or the event gone before its confirmation email. */
export type SendClaim = "recorded" | SendLimit | "eventGone";

/** The first key of the advisory locks of the sends: an address and the global cap never share a key. */
export const SEND_LOCK_CLASS = { address: 5941, global: 5942 } as const;

/**
 * Locks the address, as email-address.ts reads it, until the transaction ends: an address
 * without an account is limited too (OA3.5). Two addresses whose hashes meet only wait for
 * each other. Never before the Event.
 */
export async function lockAddress(db: Kysely<Database>, email: string): Promise<void> {
  await sql`select pg_advisory_xact_lock(${SEND_LOCK_CLASS.address}::int, hashtext(${email}))`.execute(db);
}

/** Locks the global cap until the transaction ends: every send is counted one after the other. After the address. */
export async function lockGlobalSends(db: Kysely<Database>): Promise<void> {
  await sql`select pg_advisory_xact_lock(${SEND_LOCK_CLASS.global}::int, 0)`.execute(db);
}

/**
 * Records the send unless a limit stops it, in one READ COMMITTED transaction, the caller's
 * if given (in REPEATABLE READ the count would miss a send committed during the wait). Locks
 * the event (`noKeyUpdate`: callers write its row too, and two `share` would deadlock on the
 * upgrade), the address, then the global cap. Send the email once committed, never inside.
 */
export async function recordSend(db: Kysely<Database>, request: SendRequest, now = new Date()): Promise<SendClaim> {
  return atomically(db, async (trx) => {
    if (request.kind === "confirmation" && !(await lockEvent(trx, request.eventId, "noKeyUpdate"))) {
      return "eventGone";
    }
    await lockAddress(trx, request.email);
    await lockGlobalSends(trx);
    const eventId = request.kind === "confirmation" ? request.eventId : null;
    // Sent less than an hour ago: the rule of inSendWindow.
    const { rows } = await sql<{ event: number; address: number; global: number }>`
      select
        count(*) filter (where kind = 'confirmation' and event_id = ${eventId})::int as event,
        count(*) filter (where kind = ${request.kind} and email = ${request.email})::int as address,
        count(*)::int as global
      from email_send
      where sent_at > ${new Date(now.getTime() - SEND_WINDOW_MS)}`.execute(trx);
    const recent = rows[0]!;
    const limit = sendLimitReached(
      request.kind === "confirmation"
        ? { event: recent.event, address: recent.address, global: recent.global }
        : { login: recent.address, global: recent.global },
    );
    if (limit !== null) return limit;
    await trx.insertInto("email_send").values({ kind: request.kind, email: request.email, event_id: eventId }).execute();
    return "recorded";
  });
}
