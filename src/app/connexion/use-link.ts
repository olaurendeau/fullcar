import type { Kysely } from "kysely";
import { sendConfirmation } from "@/app/create-event";
import { accountForEmail, findAccount } from "@/db/accounts";
import { claimConfirmation, findLink, useLink } from "@/db/email-links";
import { lockAddress } from "@/db/email-sends";
import { holdEventKey, lockEvent, readOrganiserAccessEvent, readPendingSend, writeEventOwner } from "@/db/events";
import type { Database } from "@/db/schema";
import { openSession } from "@/db/sessions";
import { atomically } from "@/db/transaction";
import { linkOutcome } from "@/domain/account-rules";
import type { Brevo } from "@/email/brevo";
import type { Locale } from "@/i18n/locales";

/*
 * Using the links of the emails (epic #581, OA5.2 to OA5.9): « Se connecter » on
 * /connexion/lien and « Confirmer et se connecter » on /connexion/confirmer. The token comes
 * in a request's body, read from the page's fragment on the press of the button. A session's
 * token leaves the server only in the answer that opens it. Never log a token nor an address.
 */

/**
 * - `opened`: a new session, whose token the browser keeps in place of the one it had (OA5.9);
 *   `eventId` is the event whose `/e/{id}/admin` the browser lands on, or none for Mes
 *   événements (OA4.4, OA5.3).
 * - `expired`, `used`, `invalid`: why the link opens nothing (OA5.4 to OA5.7).
 */
export type LinkAnswer =
  | { state: "opened"; session: string; eventId: string | null }
  | { state: "expired" | "used" | "invalid" };

const INVALID = { state: "invalid" } as const;
const USED = { state: "used" } as const;

/**
 * Uses a sign-in link: one session of the link's account, in one transaction with the use of
 * the link. It attaches no event, pending or not: a sign-in confirms nothing (decision 3). A
 * link of the other kind, or of an account deleted since, is `invalid`; the return event that is
 * gone leaves the landing on Mes événements.
 */
export async function openWithLoginLink(db: Kysely<Database>, token: unknown, now = new Date()): Promise<LinkAnswer> {
  return atomically(db, async (trx) => {
    // The return event's key first, as a sign-in request holds it: the link was written under it.
    const found = await findLink(trx, token);
    const asked = found?.kind === "login" ? found.returnEventId : null;
    const returnEventId = asked !== null && (await holdEventKey(trx, asked)) ? asked : null;
    const used = await useLink(trx, token, "login", now);
    if (used.outcome !== "valid") return { state: used.outcome };
    const account = used.link.accountId === null ? undefined : await findAccount(trx, used.link.accountId);
    // The account was deleted: its links go with it, so this is unreachable but for a race the link wins.
    if (!account) return INVALID;
    return { state: "opened", session: await openSession(trx, account.id), eventId: returnEventId };
  });
}

/**
 * Uses a confirmation link: the link's event, and only it (decision 3), is attached to the
 * account of the address it waited on, created in `locale` if there is none, and a session
 * of that account opens (OA5.3). One READ COMMITTED transaction, in the order of « Supprimer
 * mon compte »: the Event, the link, the address, then the account. An event already
 * confirmed says `used` (OA5.4); one anonymised, or without a pending address, `invalid`.
 */
export async function openWithConfirmationLink(
  db: Kysely<Database>,
  token: unknown,
  locale: Locale,
  now = new Date(),
): Promise<LinkAnswer> {
  const found = await findLink(db, token);
  if (found === null || found.kind !== "confirmation" || found.eventId === null) return INVALID;
  const eventId = found.eventId;
  return atomically(db, async (trx) => {
    // Read under the lock: committed, whatever waited for it (a correction, the purge, another link).
    if (!(await lockEvent(trx, eventId, "noKeyUpdate"))) return INVALID;
    const state = await readOrganiserAccessEvent(trx, eventId);
    if (state === undefined || state.anonymised) return INVALID;
    if (state.confirmed) return USED;
    const waiting = await readPendingSend(trx, eventId);
    if (waiting === undefined || waiting.email === null) return INVALID;
    const { email } = waiting;

    const used = await useLink(trx, token, "confirmation", now);
    if (used.outcome !== "valid") return { state: used.outcome };
    await lockAddress(trx, email);
    const account = await accountForEmail(trx, email, locale);
    await writeEventOwner(trx, eventId, { accountId: account.id, confirmedAt: now });
    return { state: "opened", session: await openSession(trx, account.id), eventId };
  });
}

/** `sent` or `failed` as Brevo answered (10 s at most), `tooMany` when a limit stopped it; else why no link was sent. */
export type ResendAnswer = { state: "sent" | "failed" | "tooMany" } | { state: "used" | "invalid" };

/** What the resend runs with: the server action gives the request's, a test its own. */
export interface Resending {
  db: Kysely<Database>;
  now: Date;
  /** The page's language: the email's (OA1.6). */
  locale: Locale;
  /** The site, `https://host`: the email's links start with it. */
  origin: string;
  brevo: Brevo;
}

/**
 * « Recevoir un nouveau lien » on the page of an expired confirmation link (OA5.6): one more
 * confirmation email, with nothing typed, to the address the link's event waits on. Only an
 * expired link of an event still pending asks for it: a link used, still valid, unknown, of the
 * other kind or of an event ended is `invalid` (the event confirmed meanwhile, `used`). The same
 * claim as « Renvoyer l'e-mail » (`claimConfirmation`: the event's, the address's and the global
 * limits, the send, its new link) and the result kept set to `sending`; the email goes once it is
 * committed, with no lock held. The expired link stays what it was.
 */
export async function resendExpiredConfirmation(token: unknown, resending: Resending): Promise<ResendAnswer> {
  const { db, now } = resending;
  const found = await findLink(db, token);
  if (found === null || found.kind !== "confirmation" || found.eventId === null) return INVALID;
  const eventId = found.eventId;

  const claimed = await atomically(db, async (trx): Promise<ResendAnswer | { email: string; token: string }> => {
    if (!(await lockEvent(trx, eventId, "noKeyUpdate"))) return INVALID;
    const state = await readOrganiserAccessEvent(trx, eventId);
    if (state === undefined || state.anonymised) return INVALID;
    // Read again under the lock: a correction of the address deletes the links of the old one.
    const link = await findLink(trx, token);
    if (link === null) return INVALID;
    if (state.confirmed) return USED;
    const outcome = linkOutcome(link, "confirmation", now);
    if (outcome === "used") return USED;
    if (outcome !== "expired") return INVALID;
    const waiting = await readPendingSend(trx, eventId);
    if (waiting === undefined || waiting.email === null) return INVALID;
    const { email } = waiting;
    const claim = await claimConfirmation(trx, eventId, email, now);
    if (claim.claim === "eventGone" || claim.claim === "eventEnded") return INVALID;
    if (claim.claim !== "recorded") return { state: "tooMany" } as const;
    await writeEventOwner(trx, eventId, { pendingEmail: email, sendStatus: "sending", sendStatusAt: now });
    return { email, token: claim.token };
  });
  if (!("token" in claimed)) return claimed;

  const state = await sendConfirmation(
    resending,
    { id: eventId, email: claimed.email, token: claimed.token, since: now },
    "resendEmail",
  );
  return { state };
}
