"use server";

import { cookies, headers } from "next/headers";
import { getDb } from "@/db/client";
import { databaseFailure } from "@/db/failure";
import { findSession } from "@/db/sessions";
import { brevoSettings, createBrevo } from "@/email/brevo";
import { localeCookie } from "@/i18n/locales";
import { negotiateLocale } from "@/i18n/negotiate";
import { siteOrigin } from "../site";
import { requestLoginLink, type LoginLinkAnswer } from "./request-link";
import {
  openWithConfirmationLink,
  openWithLoginLink,
  resendExpiredConfirmation,
  type LinkAnswer,
  type ResendAnswer,
} from "./use-link";

/**
 * « Recevoir le lien » on /connexion (OA4.1 to OA4.5): the same answer whether the address
 * has an account or not. The address and the event the request came from arrive in the
 * body; the email is in the page's language, as the page negotiates it. The answer carries
 * no token, and nothing logged carries the address.
 */
export async function requestLink(email: unknown, returnEventId: unknown): Promise<LoginLinkAnswer> {
  const locale = negotiateLocale((await cookies()).get(localeCookie)?.value, (await headers()).get("accept-language"));
  const brevo = createBrevo({ fetch, ...brevoSettings(process.env) });
  try {
    return await requestLoginLink(getDb(), brevo, { email, returnEventId, locale, origin: siteOrigin() });
  } catch (error) {
    // A Postgres error may carry the address: only its code is logged, none of it is thrown.
    throw databaseFailure("requestLink: the sign-in request failed", error);
  }
}

/** The address of the browser's open session, or none: `null` for an ended session, an unknown token or none. */
export type SignedInAnswer = { email: string | null };

/**
 * « Session ouverte avec {email}. » above the form of /connexion (OA4.6), asked after the
 * page has loaded: the HTML depends on no session. The session's token arrives in the body,
 * from session-token.ts; the answer is its address alone, never the token. Reads only: the
 * visit is session-visit.tsx's. Neither the token nor the address is logged.
 */
export async function signedInAs(session: unknown): Promise<SignedInAnswer> {
  try {
    const account = await findSession(getDb(), session);
    return { email: account?.email ?? null };
  } catch (error) {
    // A Postgres error may carry the row: only its code is logged, none of it is thrown.
    throw databaseFailure("signedInAs: the session could not be read", error);
  }
}

/** The page's language, as `requestLink` negotiates it. */
async function pageLocale() {
  return negotiateLocale((await cookies()).get(localeCookie)?.value, (await headers()).get("accept-language"));
}

/**
 * « Se connecter » on /connexion/lien (OA5.2): the token the page read from its fragment
 * arrives in the body, and nowhere else. The answer carries the new session's token once, to
 * the browser that replaces its own with it (OA5.9). Neither is logged.
 */
export async function openLoginLink(token: unknown): Promise<LinkAnswer> {
  try {
    return await openWithLoginLink(getDb(), token);
  } catch (error) {
    // A Postgres error may carry the row: only its code is logged, none of it is thrown.
    throw databaseFailure("openLoginLink: the sign-in link could not be used", error);
  }
}

/**
 * « Confirmer et se connecter » on /connexion/confirmer (OA5.3): attaches the link's event, and
 * only it, to the account of its address, which the page's language creates if there is none.
 */
export async function openConfirmationLink(token: unknown): Promise<LinkAnswer> {
  const locale = await pageLocale();
  try {
    return await openWithConfirmationLink(getDb(), token, locale);
  } catch (error) {
    throw databaseFailure("openConfirmationLink: the confirmation link could not be used", error);
  }
}

/**
 * « Recevoir un nouveau lien » on the page of an expired confirmation link (OA5.6): nothing is
 * typed, the email goes to the address the event waits on, in the page's language.
 */
export async function resendConfirmationLink(token: unknown): Promise<ResendAnswer> {
  const locale = await pageLocale();
  const brevo = createBrevo({ fetch, ...brevoSettings(process.env) });
  try {
    return await resendExpiredConfirmation(token, { db: getDb(), now: new Date(), locale, origin: siteOrigin(), brevo });
  } catch (error) {
    throw databaseFailure("resendConfirmationLink: the new link could not be sent", error);
  }
}
