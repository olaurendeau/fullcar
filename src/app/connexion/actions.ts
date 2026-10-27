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
