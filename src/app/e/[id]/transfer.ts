import type { Kysely } from "kysely";
import { findAccount } from "@/db/accounts";
import { claimTransfer, deleteTransferLinks } from "@/db/email-links";
import { lockEvent, readOrganiserAccessEvent, readTransfer, writeTransfer, writeTransferResult } from "@/db/events";
import { databaseFailure } from "@/db/failure";
import type { Database } from "@/db/schema";
import { findSession } from "@/db/sessions";
import { atomically } from "@/db/transaction";
import { emailAddress } from "@/domain/email-address";
import { decideOrganiserAccess, organiserProofOf } from "@/domain/organiser-access";
import { isPublicId } from "@/domain/public-id";
import { isAccountAddress, type TransferNotice } from "@/domain/transfer";
import type { Brevo, SendAnswer } from "@/email/brevo";
import { renderEmail } from "@/email/messages";
import type { Locale } from "@/i18n/locales";

/*
 * « Céder l'événement » and « Changer l'adresse » (epic #935, OT1, OT2.4, OT2.7): the organiser
 * hands event `id` over to the account of an address. The confirmation of #599, turned around:
 * an address kept with the event, a link of 7 days, a send counted under the Event's lock, an
 * email that goes once the transaction is committed. Never log a token nor an address.
 */

/**
 * - `ok`: the address is kept with the event and `transfer` is what the page now says: `sending`
 *   when the email goes out after this answer, `addressLimit` when the limit of the address or
 *   the global cap stopped it (OT1.6): the transfer exists all the same.
 * - `required`, `email`: what was typed is not an address (OT1.3); nothing was read, nothing written.
 * - `invalid`: a request no page sends.
 * - `eventNotFound`, `eventEnded`: no such event; the event is anonymised (OT5.2).
 * - `noOrganiserAccess`: organiser-access.ts grants no access, before the lock or under it (OT4.3,
 *   OT5.3, OT5.4).
 * - `pending`: the event awaits its creator's confirmation, whoever asks (OT5.1).
 * - `self`: the address is the account's own (OT1.4).
 * - `gone`: `change` with no transfer waiting (OT2.10).
 * - `tooMany`: the event's limit of the hour stopped it (OT1.6): nothing was written.
 *
 * Nothing but `ok` has written anything, and no answer carries a token.
 */
export type HandOverOutcome =
  | { ok: true; transfer: TransferNotice }
  | { ok: false; error: HandOverRefusal };

export type HandOverRefusal =
  | "required"
  | "email"
  | "invalid"
  | "eventNotFound"
  | "eventEnded"
  | "noOrganiserAccess"
  | "pending"
  | "self"
  | "gone"
  | "tooMany";

/** What a handover runs with: the server action gives the request's, a test its own. */
export interface Handing {
  db: Kysely<Database>;
  now: Date;
  /** The page's language: the email's. */
  locale: Locale;
  /** The site, `https://host`: the email's link starts with it. */
  origin: string;
  brevo: Brevo;
  /** Runs the task once the answer has gone: Next's `after()`. */
  later: (task: () => Promise<void>) => void;
}

const refusal = <E extends HandOverRefusal>(error: E) => ({ ok: false, error }) as const;

/** An own field of the request, as it came: anything else carries nothing. */
function ownField(input: object, key: string): unknown {
  return Object.hasOwn(input, key) ? (input as Record<string, unknown>)[key] : undefined;
}

/** The operation a page sends, and what was typed with it; nothing for any other request. */
function requestOf(request: unknown): { op: "start" | "change"; typed: unknown } | undefined {
  if (typeof request !== "object" || request === null || Array.isArray(request)) return undefined;
  const op = ownField(request, "op");
  if (op !== "start" && op !== "change") return undefined;
  return { op, typed: ownField(request, "email") };
}

/**
 * Why `proof` opens nothing on the event, or why it cannot be handed over, as `db` reads it
 * now; nothing when it can. In this order: no such event, an anonymised event, no organiser
 * access (nobody, another account, no organiser), an event still pending (the creation
 * browser's token opens it, but it is not handed over).
 */
async function accessRefusal(db: Kysely<Database>, eventId: string, proof: unknown) {
  const accessEvent = await readOrganiserAccessEvent(db, eventId);
  if (accessEvent === undefined) return refusal("eventNotFound");
  if (accessEvent.anonymised) return refusal("eventEnded");
  const { adminToken, session } = organiserProofOf(proof);
  const decision = decideOrganiserAccess(accessEvent, { adminToken, account: await findSession(db, session) });
  if (decision.state !== "organiser") return refusal("noOrganiserAccess");
  return accessEvent.confirmed ? undefined : refusal("pending");
}

/**
 * The organiser hands event `eventId` over to `request.email`, or changes the address a
 * handover waits on. `proof` is the request's body, `{ adminToken, session }`. In this order:
 * the shape of the request, the field (`required`, `email`: nothing is read nor written), the
 * id, the access, then one transaction (READ COMMITTED): the Event under
 * `lockEvent(…, "noKeyUpdate")`, the access decided again under it (#836, OT4.3), the address
 * of the account (`self`), the handover that waits (`change` needs one: `gone`), then
 * `claimTransfer` (the event's, the address's and the global limits, the send, its new link),
 * the address with `sending` since `now`, and the links sent to the address it replaces deleted.
 * `start` replaces a handover that waits (OT2.7). A limit of the event writes nothing; one of
 * the address or the global cap writes the handover as `address_limit`, with no link, and
 * deletes the earlier links when the address changes, so that the only address that can accept
 * is the one the page shows; when it is the address already waiting, its links still work and stay. The address of the recipient is never looked up among the accounts (OT1.7,
 * OT1.8). Past the commit, with no lock held, the email goes by `later`, and Brevo's answer is
 * kept (`sendTransfer`): the answer never waits for it.
 */
export async function handOverEvent(eventId: unknown, proof: unknown, request: unknown, handing: Handing): Promise<HandOverOutcome> {
  const { db, now } = handing;
  const read = requestOf(request);
  if (read === undefined) return refusal("invalid");
  const address = emailAddress(read.typed);
  if ("error" in address) return refusal(address.error === "required" ? "required" : "email");
  if (!isPublicId(eventId)) return refusal("eventNotFound");
  const refused = await accessRefusal(db, eventId, proof);
  if (refused) return refused;

  const claimed = await atomically(db, async (trx) => {
    const row = await lockEvent(trx, eventId, "noKeyUpdate");
    if (row === undefined) return refusal("eventNotFound");
    const refusedNow = await accessRefusal(trx, eventId, proof);
    if (refusedNow) return refusedNow;
    const account = row.account_id === null ? undefined : await findAccount(trx, row.account_id);
    if (account === undefined) return refusal("noOrganiserAccess");
    if (isAccountAddress(address.value, account.email)) return refusal("self");
    const waiting = await readTransfer(trx, eventId);
    if (read.op === "change" && waiting?.email == null) return refusal("gone");

    const claim = await claimTransfer(trx, eventId, address.value, now);
    if (claim.claim === "eventGone") return refusal("eventNotFound");
    if (claim.claim === "eventEnded") return refusal("eventEnded");
    if (claim.claim === "event") return refusal("tooMany");
    if (claim.claim !== "recorded") {
      await writeTransfer(trx, eventId, { email: address.value, status: "address_limit", at: now });
      // The links sent to the address it replaces go; those of the address already waiting still work.
      if (waiting?.email !== address.value) await deleteTransferLinks(trx, eventId);
      return { email: address.value, token: undefined };
    }
    await writeTransfer(trx, eventId, { email: address.value, status: "sending", at: now });
    await deleteTransferLinks(trx, eventId, { except: claim.token });
    return { email: address.value, token: claim.token };
  });
  if ("ok" in claimed) return claimed;

  const { email, token } = claimed;
  if (token === undefined) return { ok: true, transfer: { email, send: "addressLimit" } };
  handing.later(async () => void (await sendTransfer(handing, { id: eventId, email, token, since: now })));
  return { ok: true, transfer: { email, send: "sending" } };
}

/**
 * The transfer email, after the answer: Brevo answers within 10 s, sent or failed, and its
 * answer replaces the `sending` written at `since`; a transfer replaced, cancelled or stopped
 * meanwhile keeps what it has. Throws nothing: there is nobody left to answer. What it logs is
 * fixed words, and a database error's code.
 */
export async function sendTransfer(
  { db, brevo, locale, origin }: Pick<Handing, "db" | "brevo" | "locale" | "origin">,
  { id, email, token, since }: { id: string; email: string; token: string; since: Date },
): Promise<SendAnswer["state"]> {
  let answer: SendAnswer = { state: "failed" };
  try {
    answer = await brevo.send({ to: email, ...renderEmail({ kind: "transfer", locale, origin, token }) });
  } catch {
    // Only renderEmail throws, on an origin that is not one: its error is not read.
    console.error("transferEvent: the email could not be written");
  }
  try {
    await writeTransferResult(db, id, since, answer.state);
  } catch (error) {
    databaseFailure("transferEvent: the result of the email could not be stored", error);
  }
  return answer.state;
}
