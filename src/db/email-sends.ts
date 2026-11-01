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

/**
 * A confirmation email for a pending event, a transfer email for an event being handed over
 * (epic #935), or the answer to a sign-in request (OA3.5).
 */
export type SendRequest =
  | { kind: "confirmation" | "transfer"; eventId: string; email: string }
  | { kind: "login"; email: string };

/** The send recorded, the limit that stops it, or the event gone before its confirmation email. */
export type SendClaim = "recorded" | SendLimit | "eventGone";

/** The first key of the advisory locks of the sends: an address and the global cap never share a key. */
export const SEND_LOCK_CLASS = { address: 5941, global: 5942 } as const;

/**
 * Locks the address, as email-address.ts reads it, until the transaction ends: an address
 * without an account is limited too (OA3.5). Two addresses whose hashes meet only wait for
 * each other. After the Event, except for the account deletion: `clearLateAddress` (accounts.ts)
 * locks the events and the links once it holds the address (#986), so a path that locks an event
 * then the address, `confirmAgain` (app/e/[id]/pending-email.ts) here, can deadlock with it
 * (40P01). Postgres cancels one: `deleteAccountOf` tries the deletion once more, and `confirmAgain`
 * fails as a `databaseFailure`, shown as « failed » for the organiser to resend or correct again.
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
    const eventId = request.kind === "login" ? null : request.eventId;
    if (eventId !== null && !(await lockEvent(trx, eventId, "noKeyUpdate"))) return "eventGone";
    await lockAddress(trx, request.email);
    await lockGlobalSends(trx);
    const addressKinds = request.kind === "login" ? ["login"] : ["confirmation", "transfer"];
    // Sent less than an hour ago: the rule of inSendWindow. The address counts the confirmation and
    // transfer emails together (decision 3 of the design of #935); a sign-in request counts apart.
    const { rows } = await sql<{ event: number; address: number; global: number }>`
      select
        count(*) filter (where kind = ${request.kind} and event_id = ${eventId})::int as event,
        count(*) filter (where email = ${request.email} and kind in (${sql.join(addressKinds)}))::int as address,
        count(*)::int as global
      from email_send
      where sent_at > ${new Date(now.getTime() - SEND_WINDOW_MS)}`.execute(trx);
    const recent = rows[0]!;
    const limit = sendLimitReached(
      request.kind === "login"
        ? { login: recent.address, global: recent.global }
        : request.kind === "transfer"
          ? { transfer: recent.event, address: recent.address, global: recent.global }
          : { event: recent.event, address: recent.address, global: recent.global },
    );
    if (limit !== null) return limit;
    await trx.insertInto("email_send").values({ kind: request.kind, email: request.email, event_id: eventId }).execute();
    return "recorded";
  });
}
