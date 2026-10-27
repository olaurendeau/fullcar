import type { Kysely } from "kysely";
import { claimConfirmation } from "@/db/email-links";
import { insertEvent, writeEventOwner, writeSendResult } from "@/db/events";
import { databaseFailure } from "@/db/failure";
import type { Database } from "@/db/schema";
import { findSession } from "@/db/sessions";
import { atomically } from "@/db/transaction";
import { hashAdminToken, newAdminToken } from "@/domain/admin-token";
import { emailAddress, type EmailError } from "@/domain/email-address";
import { eventFieldsOf, serverBounds, validateEvent, type EventErrors } from "@/domain/event";
import type { Brevo, SendAnswer } from "@/email/brevo";
import { renderEmail } from "@/email/messages";
import type { Locale } from "@/i18n/locales";

/*
 * Creating an event (epic #3; epic #581, OA1): with the session of an account, the event is
 * the account's at once (OA1.3); with an address, it is pending, and a confirmation link
 * goes to the address once the answer has gone (OA1.6, OA1.7). Until « adresse obligatoire »
 * (#614), a request with neither still creates an event without an organiser.
 * Never log a token nor an address: fixed words only, and a database error's code.
 */

/** `sessionEnded`: the session sent ended before the creation, and no address came with it (OA1.5). */
export type CreationErrors = EventErrors & { email?: EmailError | "sessionEnded" };

export type CreateEventResult = { ok: true; id: string; token: string } | { ok: false; errors: CreationErrors };

/** What a creation runs with: the server action gives the request's, a test its own. */
export interface Creation {
  db: Kysely<Database>;
  now: Date;
  /** The page's language: the confirmation email's (OA1.6). */
  locale: Locale;
  /** The site, `https://host`: the email's links start with it. */
  origin: string;
  brevo: Brevo;
  /** Runs the task once the answer has gone: Next's `after()`. */
  later: (task: () => Promise<void>) => void;
}

/** Who the event is for, once read: the account of a live session, an address, or nobody (until #614). */
type Organiser = { accountId: string } | { email: string } | null;

/** An own field of the body, as it came: anything else carries nothing. */
function ownField(input: unknown, key: string): unknown {
  if (typeof input !== "object" || input === null || !Object.hasOwn(input, key)) return undefined;
  return (input as Record<string, unknown>)[key];
}

/**
 * The organiser, or the address's error. A live session wins: its page has no address field
 * (OA1.3). Otherwise an address sent is read as the form reads it (OA1.4), the one typed
 * after a session ended included. Otherwise a session sent has ended (OA1.5). Decision: a
 * session that is not a string, or unknown, reads as ended too. — Reason: the server cannot
 * tell it from a session deleted in the database, and either way the form must ask for the
 * address.
 */
async function organiserOf(input: unknown, { db, now }: Creation): Promise<{ organiser: Organiser } | { error: CreationErrors["email"] }> {
  const session = ownField(input, "session");
  const email = ownField(input, "email");
  const sent = (value: unknown) => value !== undefined && value !== null;
  if (sent(session)) {
    const account = await findSession(db, session, now);
    if (account) return { organiser: { accountId: account.id } };
  }
  if (email !== undefined) {
    const address = emailAddress(email);
    return "error" in address ? { error: address.error } : { organiser: { email: address.value } };
  }
  return sent(session) ? { error: "sessionEnded" } : { organiser: null };
}

/**
 * Creates the event, checked against the server's own date bounds, in one transaction: the
 * event, then, with an address, its send and its link (claimConfirmation), and the status of
 * its email. The email goes out after the commit, by `later`, with no lock held: the answer
 * never waits for Brevo (OA1.2). The organiser's admin token leaves the server only here, in
 * the result's body; the link's token, only in the email.
 */
export async function createEventFor(input: unknown, creation: Creation): Promise<CreateEventResult> {
  const { db, now } = creation;
  const validation = validateEvent(eventFieldsOf(input), serverBounds(now));
  let read: Awaited<ReturnType<typeof organiserOf>>;
  try {
    read = await organiserOf(input, creation);
  } catch (error) {
    throw databaseFailure("createEvent: the session could not be read", error);
  }
  if (!validation.ok || "error" in read) {
    const errors: CreationErrors = validation.ok ? {} : { ...validation.errors };
    if ("error" in read) errors.email = read.error;
    return { ok: false, errors };
  }

  const { organiser } = read;
  const token = newAdminToken();
  let stored: { id: string; link: string | null };
  try {
    stored = await atomically(db, async (trx) => {
      const id = await insertEvent(trx, validation.event, hashAdminToken(token));
      if (organiser === null) return { id, link: null };
      if ("accountId" in organiser) {
        await writeEventOwner(trx, id, { accountId: organiser.accountId, confirmedAt: now });
        return { id, link: null };
      }
      const claimed = await claimConfirmation(trx, id, organiser.email, now);
      if (claimed.claim === "eventGone" || claimed.claim === "eventEnded") {
        throw new Error("createEvent: the new event was not found under its lock");
      }
      // A limit leaves nothing sent: `address_limit`, the global cap's too (decision of the review of #623).
      const link = claimed.claim === "recorded" ? claimed.token : null;
      const sendStatus = link === null ? "address_limit" : "sending";
      await writeEventOwner(trx, id, { pendingEmail: organiser.email, sendStatus, sendStatusAt: now });
      return { id, link };
    });
  } catch (error) {
    // A Postgres error may carry the row: only its code is logged, none of it is thrown.
    throw databaseFailure("createEvent: the event could not be stored", error);
  }

  const { id, link } = stored;
  if (link !== null && organiser !== null && "email" in organiser) {
    const email = organiser.email;
    creation.later(async () => void (await sendConfirmation(creation, { id, email, token: link, since: now })));
  }
  return { ok: true, id, token };
}

/**
 * The confirmation email, after the answer (OA1.7): Brevo answers within 10 s, sent or
 * failed, and its answer replaces the `sending` the creation wrote at `since`; a resend
 * (#601) sends it the same way, and has the answer. Throws nothing: there is nobody left to
 * answer.
 */
export async function sendConfirmation(
  { db, brevo, locale, origin }: Pick<Creation, "db" | "brevo" | "locale" | "origin">,
  { id, email, token, since }: { id: string; email: string; token: string; since: Date },
): Promise<SendAnswer["state"]> {
  let answer: SendAnswer = { state: "failed" };
  try {
    answer = await brevo.send({ to: email, ...renderEmail({ kind: "confirmation", locale, origin, token }) });
  } catch {
    // Only renderEmail throws, on an origin that is not one: its error is not read.
    console.error("createEvent: the email could not be written");
  }
  try {
    await writeSendResult(db, id, since, answer.state);
  } catch (error) {
    databaseFailure("createEvent: the result of the email could not be stored", error);
  }
  return answer.state;
}
