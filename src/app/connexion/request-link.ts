import type { Kysely } from "kysely";
import { findAccountByEmail } from "@/db/accounts";
import { createLink } from "@/db/email-links";
import { recordSend } from "@/db/email-sends";
import { holdEventKey } from "@/db/events";
import type { Database } from "@/db/schema";
import { atomically } from "@/db/transaction";
import { emailAddress, type EmailError } from "@/domain/email-address";
import { isPublicId } from "@/domain/public-id";
import type { Brevo } from "@/email/brevo";
import { renderEmail, type EmailInput } from "@/email/messages";
import type { Locale } from "@/i18n/locales";

/*
 * A sign-in link asked for on /connexion (epic #581, OA3.5, OA4.2, OA4.4, OA4.5). Never log
 * the address nor the token: the token leaves the server only in the email, after `#`.
 */

export interface LoginLinkRequest {
  /** As typed: read here as email-address.ts reads it. */
  email: unknown;
  /** The event of `/e/{id}/admin` the request came from, if it did: where the link lands (OA4.4). */
  returnEventId: unknown;
  /** The page's language, the email's (OA3.1). */
  locale: Locale;
  /** The site, `https://host`: every link of the email starts with it. */
  origin: string;
}

/**
 * The same answers whether the address has an account or not (OA4.2, decision 11): `sent`
 * for « Regardez vos e-mails », `failed` for `Login.failed` (Brevo refused, or did not answer
 * in 10 s), `tooMany` for `Login.tooMany`, `invalid` for the field. No token, no account.
 */
export type LoginLinkAnswer = { state: "sent" | "failed" | "tooMany" } | { state: "invalid"; error: EmailError };

/**
 * Records the send, then, for an address with an account, stores its sign-in link, in one
 * transaction; once it is committed, with no lock held, sends the email: the sign-in link,
 * or « adresse sans compte » with no token and no account created (OA3.5). A send Brevo
 * refused counts in the limits, and its link stays valid: Brevo may still have accepted it.
 *
 * Decision: the global cap answers `tooMany`, as the per-address limit does. — Reason: as at
 * the creation (#623 review, « L'adresse après l'Event »), nothing went out and we know it;
 * `Login.failed` would say the link « may » have been sent.
 */
export async function requestLoginLink(db: Kysely<Database>, brevo: Brevo, request: LoginLinkRequest): Promise<LoginLinkAnswer> {
  const read = emailAddress(request.email);
  if ("error" in read) return { state: "invalid", error: read.error };
  const email = read.value;
  const asked = isPublicId(request.returnEventId) ? request.returnEventId : null;

  const claim = await atomically(db, async (trx): Promise<{ token: string | null } | null> => {
    // The Event before the address, as every send takes them; held so that it stays until the link refers to it.
    const returnEventId = asked !== null && (await holdEventKey(trx, asked)) ? asked : null;
    if ((await recordSend(trx, { kind: "login", email })) !== "recorded") return null;
    const account = await findAccountByEmail(trx, email);
    if (!account) return { token: null };
    return { token: await createLink(trx, { kind: "login", accountId: account.id, returnEventId }) };
  });
  if (claim === null) return { state: "tooMany" };

  const { locale, origin } = request;
  const input: EmailInput =
    claim.token === null ? { kind: "noAccount", locale, origin } : { kind: "signIn", locale, origin, token: claim.token };
  const answer = await brevo.send({ to: email, ...renderEmail(input) });
  return { state: answer.state };
}
