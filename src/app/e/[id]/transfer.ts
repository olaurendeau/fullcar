import type { Kysely } from "kysely";
import { findAccount } from "@/db/accounts";
import { claimTransfer, deleteTransferLinks } from "@/db/email-links";
import { clearTransfer, lockEvent, readOrganiserAccessEvent, readTransfer, writeTransfer, writeTransferResult } from "@/db/events";
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
 * « Céder l'événement », « Changer l'adresse », « Renvoyer l'e-mail » and « Annuler la cession »
 * (epic #935, OT1, OT2.3 to OT2.7): the organiser hands event `id` over to the account of an
 * address. The confirmation of #599, turned around: an address kept with the event, a link of 7
 * days, a send counted under the Event's lock, an email that goes once the transaction is
 * committed. Never log a token nor an address.
 */

/**
 * - `ok` with `transfer`: the address is kept with the event and `transfer` is what the page now
 *   says: `sending` when the email goes out after this answer, `addressLimit` when the limit of
 *   the address or the global cap stopped it (OT1.6): the transfer exists all the same. After
 *   `resend` it is `sent` or `failed`: the answer waited for Brevo (10 s at most).
 * - `ok` with `cancelled`: the transfer is over and its links are deleted; the address it waited on.
 * - `required`, `email`: what was typed is not an address (OT1.3); nothing was read, nothing written.
 * - `invalid`: a request no page sends.
 * - `eventNotFound`, `eventEnded`: no such event; the event is anonymised (OT5.2).
 * - `noOrganiserAccess`: organiser-access.ts grants no access, before the lock or under it (OT4.3,
 *   OT5.3, OT5.4).
 * - `pending`: the event awaits its creator's confirmation, whoever asks (OT5.1).
 * - `self`: the address is the account's own (OT1.4).
 * - `gone`: `change`, `resend` or `cancel` with no transfer waiting (OT2.10).
 * - `tooMany`: a limit stopped it, the event's for `start` and `change` (OT1.6), any of them for
 *   `resend` (the event's, the address's, the global cap): nothing was written.
 *
 * Nothing but `ok` has written anything, and no answer carries a token.
 */
export type HandOverOutcome =
  | { ok: true; transfer: TransferNotice }
  | { ok: true; cancelled: string }
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

/**
 * The operation a page sends, and what was typed with it (`start` and `change` only: the other
 * two carry no field, and what comes with them is not read); nothing for any other request.
 */
function requestOf(request: unknown): { op: "start" | "change"; typed: unknown } | { op: "resend" | "cancel" } | undefined {
  if (typeof request !== "object" || request === null || Array.isArray(request)) return undefined;
  const op = ownField(request, "op");
  if (op === "resend" || op === "cancel") return { op };
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

/** What `read` asks, with the address `start` and `change` carry; the field's error when what was typed is not one. */
function askedOf(
  read: NonNullable<ReturnType<typeof requestOf>>,
): { op: "start" | "change"; address: string } | { op: "resend" | "cancel" } | { error: "required" | "email" } {
  if (!("typed" in read)) return read;
  const address = emailAddress(read.typed);
  if ("error" in address) return { error: address.error === "required" ? "required" : "email" } as const;
  return { op: read.op, address: address.value };
}

/**
 * « Annuler la cession » (OT2.5), in the transaction of `handOverEvent`, under the Event's
 * lock: every transfer link deleted, the address and its result cleared. Gives the address
 * cancelled; `gone` when none waits (OT2.10). No send is counted: a cancel is never limited.
 */
async function cancelTransfer(trx: Kysely<Database>, eventId: string) {
  const waiting = await readTransfer(trx, eventId);
  if (waiting?.email == null) return refusal("gone");
  await deleteTransferLinks(trx, eventId);
  await clearTransfer(trx, eventId);
  return { ok: true, cancelled: waiting.email } as const;
}

/**
 * « Renvoyer l'e-mail » (OT2.3), in the transaction of `handOverEvent`, under the Event's lock:
 * one more link to the address that waits, the earlier ones kept, `sending` since `now`. Any
 * limit is `tooMany` and writes nothing; `gone` when no transfer waits (OT2.10).
 */
async function claimResend(trx: Kysely<Database>, eventId: string, now: Date) {
  const waiting = await readTransfer(trx, eventId);
  if (waiting?.email == null) return refusal("gone");
  const claim = await claimTransfer(trx, eventId, waiting.email, now);
  if (claim.claim === "eventGone") return refusal("eventNotFound");
  if (claim.claim === "eventEnded") return refusal("eventEnded");
  if (claim.claim !== "recorded") return refusal("tooMany");
  await writeTransfer(trx, eventId, { email: waiting.email, status: "sending", at: now });
  return { email: waiting.email, token: claim.token };
}

/**
 * The organiser hands event `eventId` over to `request.email`, changes the address a handover
 * waits on, resends its email, or cancels it. `proof` is the request's body,
 * `{ adminToken, session }`. In this order: the shape of the request, the field (`start` and
 * `change`: `required`, `email`, nothing is read nor written), the id, the access, then one
 * transaction (READ COMMITTED): the Event under `lockEvent(…, "noKeyUpdate")`, the access decided
 * again under it (#836, OT4.3), then for `start` and `change` the address of the account
 * (`self`), the handover that waits (`change` needs one: `gone`), `claimTransfer` (the event's,
 * the address's and the global limits, the send, its new link), the address with `sending`
 * since `now`, and the links sent to the address it replaces deleted.
 * `start` replaces a handover that waits (OT2.7). A limit of the event writes nothing; one of
 * the address or the global cap writes the handover as `address_limit`, with no link, and
 * deletes the earlier links when the address changes, so that the only address that can accept
 * is the one the page shows; when it is the address already waiting, its links still work and
 * stay. The address of the recipient is never looked up among the accounts (OT1.7, OT1.8).
 * `resend` and `cancel` need a handover that waits (`gone`): see `claimResend` and
 * `cancelTransfer`. Past the commit, with no lock held, the email goes by `later`, and Brevo's
 * answer is kept (`sendTransfer`): the answer never waits for it, but a resend's does.
 */
export async function handOverEvent(eventId: unknown, proof: unknown, request: unknown, handing: Handing): Promise<HandOverOutcome> {
  const { db, now } = handing;
  const read = requestOf(request);
  if (read === undefined) return refusal("invalid");
  const asked = askedOf(read);
  if ("error" in asked) return refusal(asked.error);
  if (!isPublicId(eventId)) return refusal("eventNotFound");
  const refused = await accessRefusal(db, eventId, proof);
  if (refused) return refused;

  const claimed = await atomically(db, async (trx) => {
    const row = await lockEvent(trx, eventId, "noKeyUpdate");
    if (row === undefined) return refusal("eventNotFound");
    const refusedNow = await accessRefusal(trx, eventId, proof);
    if (refusedNow) return refusedNow;
    // Only `start` and `change` carry an address.
    if (!("address" in asked)) return asked.op === "cancel" ? cancelTransfer(trx, eventId) : claimResend(trx, eventId, now);
    const account = row.account_id === null ? undefined : await findAccount(trx, row.account_id);
    if (account === undefined) return refusal("noOrganiserAccess");
    if (isAccountAddress(asked.address, account.email)) return refusal("self");
    const waiting = await readTransfer(trx, eventId);
    if (asked.op === "change" && waiting?.email == null) return refusal("gone");

    const claim = await claimTransfer(trx, eventId, asked.address, now);
    if (claim.claim === "eventGone") return refusal("eventNotFound");
    if (claim.claim === "eventEnded") return refusal("eventEnded");
    if (claim.claim === "event") return refusal("tooMany");
    if (claim.claim !== "recorded") {
      await writeTransfer(trx, eventId, { email: asked.address, status: "address_limit", at: now });
      // The links sent to the address it replaces go; those of the address already waiting still work.
      if (waiting?.email !== asked.address) await deleteTransferLinks(trx, eventId);
      return { email: asked.address, token: undefined };
    }
    await writeTransfer(trx, eventId, { email: asked.address, status: "sending", at: now });
    await deleteTransferLinks(trx, eventId, { except: claim.token });
    return { email: asked.address, token: claim.token };
  });
  if ("ok" in claimed) return claimed;

  const { email, token } = claimed;
  if (token === undefined) return { ok: true, transfer: { email, send: "addressLimit" } };
  // A resend has the answer of Brevo, as `resendEmail` has: the page shows `sent` or `failed`.
  if (asked.op === "resend") return { ok: true, transfer: { email, send: await sendTransfer(handing, { id: eventId, email, token, since: now }) } };
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
