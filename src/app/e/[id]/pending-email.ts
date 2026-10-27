import type { Kysely } from "kysely";
import { sendConfirmation } from "@/app/create-event";
import { claimConfirmation } from "@/db/email-links";
import { lockEvent, readOrganiserAccessEvent, readPendingSend, writeEventOwner } from "@/db/events";
import type { Database } from "@/db/schema";
import { findSession } from "@/db/sessions";
import { atomically } from "@/db/transaction";
import { decideOrganiserAccess, organiserProofOf } from "@/domain/organiser-access";
import type { PendingNotice } from "@/domain/pending-send";
import { isPublicId } from "@/domain/public-id";
import type { Brevo } from "@/email/brevo";
import type { Locale } from "@/i18n/locales";

/*
 * « Renvoyer l'e-mail » (epic #581, OA2.4): one more confirmation email, to the address the
 * event waits on, for the creation browser that holds its admin token. The earlier links stay
 * valid. Never log a token nor an address.
 */

/**
 * - `ok`: the email went to Brevo, which answered `sent` or `failed` (10 s at most); the
 *   notice is what the page now says, and the result kept with the event.
 * - `tooMany`: a limit stopped it before it went, the event's, the address's or the global
 *   cap (OA2.4): nothing was sent nor written.
 * - `notPending`: nothing awaits confirmation any more (OA2.6), or never did.
 * - `invalid`: the proof opens nothing on the event, or no longer does (#836).
 * - `eventNotFound`, `eventEnded`: as for any change by the organiser.
 */
export type ResendOutcome =
  | { ok: true; pending: PendingNotice }
  | { ok: false; error: "tooMany" | "notPending" | "invalid" | "eventNotFound" | "eventEnded" };

/** What a resend runs with: the server action gives the request's, a test its own. */
export interface Resending {
  db: Kysely<Database>;
  now: Date;
  /** The page's language: the email's, as at the creation (OA1.6). */
  locale: Locale;
  /** The site, `https://host`: the email's links start with it. */
  origin: string;
  brevo: Brevo;
}

const EVENT_NOT_FOUND = { ok: false, error: "eventNotFound" } as const;
const EVENT_ENDED = { ok: false, error: "eventEnded" } as const;
const INVALID = { ok: false, error: "invalid" } as const;
const NOT_PENDING = { ok: false, error: "notPending" } as const;
const TOO_MANY = { ok: false, error: "tooMany" } as const;

/**
 * Why `proof` opens nothing on the event, as `db` reads it now; nothing when it is the
 * organiser's (organiser-access.ts). An anonymised event answers `eventEnded` first.
 */
async function accessRefusal(db: Kysely<Database>, eventId: string, proof: unknown) {
  const accessEvent = await readOrganiserAccessEvent(db, eventId);
  if (accessEvent === undefined) return EVENT_NOT_FOUND;
  if (accessEvent.anonymised) return EVENT_ENDED;
  const { adminToken, session } = organiserProofOf(proof);
  const decision = decideOrganiserAccess(accessEvent, { adminToken, account: await findSession(db, session) });
  return decision.state === "organiser" ? undefined : INVALID;
}

/**
 * The organiser resends the confirmation email of event `eventId`. `proof` is the request's
 * body, `{ adminToken, session }`. In this order: the id, the access, then one transaction
 * (READ COMMITTED): the Event under `lockEvent(…, "noKeyUpdate")`, the access decided again
 * under it, the address read as committed, then `claimConfirmation` (the event's, the
 * address's and the global limits, the send, its new link) and the result kept set to
 * `sending` since `now`, which replaces the one before (OA1.10). Past the commit, with no
 * lock held, the email goes and Brevo's answer is kept (`sendConfirmation`); a resend that
 * a limit stops writes nothing. A failure of Brevo is not an error here: the notice says it.
 */
export async function resendConfirmation(eventId: unknown, proof: unknown, resending: Resending): Promise<ResendOutcome> {
  const { db, now } = resending;
  if (!isPublicId(eventId)) return EVENT_NOT_FOUND;
  const refused = await accessRefusal(db, eventId, proof);
  if (refused) return refused;

  const claimed = await atomically(db, async (trx) => {
    const row = await lockEvent(trx, eventId, "noKeyUpdate");
    if (row === undefined) return EVENT_NOT_FOUND;
    if (row.anonymised_at !== null) return EVENT_ENDED;
    const refusedNow = await accessRefusal(trx, eventId, proof);
    if (refusedNow) return refusedNow;
    const waiting = await readPendingSend(trx, eventId);
    if (waiting === undefined || waiting.email === null) return NOT_PENDING;
    const { email } = waiting;
    const claim = await claimConfirmation(trx, eventId, email, now);
    if (claim.claim === "eventGone") return EVENT_NOT_FOUND;
    if (claim.claim === "eventEnded") return EVENT_ENDED;
    if (claim.claim !== "recorded") return TOO_MANY;
    await writeEventOwner(trx, eventId, { pendingEmail: email, sendStatus: "sending", sendStatusAt: now });
    return { email, token: claim.token };
  });
  if ("ok" in claimed) return claimed;

  const { email, token } = claimed;
  const send = await sendConfirmation(resending, { id: eventId, email, token, since: now }, "resendEmail");
  return { ok: true, pending: { email, send } };
}
