import type { Kysely } from "kysely";
import { accountForEmail } from "@/db/accounts";
import { deleteTransferLinks, findLink, useLink } from "@/db/email-links";
import { lockAddress } from "@/db/email-sends";
import { findEventById, lockEvent, readOrganiserAccessEvent, readTransfer, writeTakeover } from "@/db/events";
import type { Database } from "@/db/schema";
import { openSession } from "@/db/sessions";
import { atomically, onOneSnapshot } from "@/db/transaction";
import { linkOutcome } from "@/domain/account-rules";
import type { Locale } from "@/i18n/locales";
import type { LinkAnswer } from "./use-link";

/*
 * The link of a transfer email (epic #935, OT3): the recipient reads the page of
 * /connexion/cession#{token}, which says what event it hands over, then accepts it. The token
 * comes in a request's body, read from the page's fragment. Never log a token nor an address.
 */

/**
 * What the page of a transfer link says when it loads (OT3.1): `valid` with the event's title
 * and start, `allerAt` as the event keeps it (the wall-clock time at its place); or why the link
 * opens nothing (OT3.6), with neither a title nor a date.
 */
export type TransferReading = { state: "valid"; title: string; allerAt: string } | { state: "expired" | "used" | "invalid" };

const INVALID = { state: "invalid" } as const;
const USED = { state: "used" } as const;
const EXPIRED = { state: "expired" } as const;

/**
 * Reads what the page of a transfer link shows, on one snapshot, and writes nothing: the link
 * is not used, no session is read nor opened, no account is created. It is the only page of a
 * link whose token goes to the server at load (an exception to OA5.1 the owner granted, Q4 of
 * #935): reading it consumes nothing, so a scanner that follows the link spends nothing. The
 * title and the start are given for a link that serves only: unused, unexpired, of an event not
 * anonymised, with an account, whose handover still waits. Any other link, an unknown token and
 * a value that is no token included, gives its state alone.
 */
export async function readTransferLink(db: Kysely<Database>, token: unknown, now = new Date()): Promise<TransferReading> {
  return onOneSnapshot(db, async (trx): Promise<TransferReading> => {
    const link = await findLink(trx, token);
    if (link === null || link.eventId === null) return INVALID;
    const outcome = linkOutcome(link, "transfer", now);
    if (outcome === "used") return USED;
    if (outcome === "expired") return EXPIRED;
    if (outcome !== "valid") return INVALID;
    const access = await readOrganiserAccessEvent(trx, link.eventId);
    if (access === undefined || access.anonymised || !access.confirmed || access.accountId === null) return INVALID;
    const handover = await readTransfer(trx, link.eventId);
    if (handover?.email == null) return INVALID;
    const event = await findEventById(trx, link.eventId);
    if (event === undefined) return INVALID;
    return { state: "valid", title: event.title, allerAt: event.aller_at };
  });
}

/**
 * « Accepter l'événement » (OT3.2): the event passes to the account of the address it was handed
 * to, created in `locale` if there is none (a locale the page negotiated), and a session of that
 * account opens. One READ COMMITTED transaction, in the order of the confirmation and of « Supprimer
 * mon compte »: the link is looked up, then the Event under `lockEvent(…, "noKeyUpdate")`, where
 * everything is read again as committed (the link, then the access and the handover), then the use of
 * the link, the other transfer links of the event deleted by key, the address, the account, and the
 * Event's row written: the account, the admin token revoked, the handover cleared. A cancellation
 * and an acceptance meet on the Event's lock (OT3.7): the link a cancellation deleted is `invalid`,
 * the link another acceptance used is `used`. A link of another kind, unknown, expired, or of an
 * event anonymised, without account or no longer handed over, opens nothing. The address is never
 * looked up before the lock, and the one who hands over is told nothing (OT4.4). The new session's
 * token leaves only in this answer.
 */
export async function openWithTransferLink(db: Kysely<Database>, token: unknown, locale: Locale, now = new Date()): Promise<LinkAnswer> {
  const found = await findLink(db, token);
  if (typeof token !== "string" || found === null || found.kind !== "transfer" || found.eventId === null) return INVALID;
  const eventId = found.eventId;
  return atomically(db, async (trx): Promise<LinkAnswer> => {
    // Read under the lock: committed, whatever waited for it (a cancellation, a change of address, another acceptance).
    if (!(await lockEvent(trx, eventId, "noKeyUpdate"))) return INVALID;
    const link = await findLink(trx, token);
    if (link === null) return INVALID;
    const outcome = linkOutcome(link, "transfer", now);
    if (outcome === "used") return USED;
    if (outcome === "expired") return EXPIRED;
    if (outcome !== "valid") return INVALID;
    const access = await readOrganiserAccessEvent(trx, eventId);
    if (access === undefined || access.anonymised || !access.confirmed || access.accountId === null) return INVALID;
    const handover = await readTransfer(trx, eventId);
    if (handover?.email == null) return INVALID;
    const { email } = handover;

    const used = await useLink(trx, token, "transfer", now);
    if (used.outcome !== "valid") return { state: used.outcome };
    await deleteTransferLinks(trx, eventId, { except: token });
    await lockAddress(trx, email);
    const account = await accountForEmail(trx, email, locale);
    await writeTakeover(trx, eventId, account.id);
    return { state: "opened", session: await openSession(trx, account.id), eventId };
  });
}
