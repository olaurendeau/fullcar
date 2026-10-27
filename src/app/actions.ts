"use server";

import { getLocale } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { getDb } from "@/db/client";
import { databaseFailure } from "@/db/failure";
import { visitSession } from "@/db/sessions";
import { serverBrevo } from "@/email/brevo";
import { defaultLocale, isLocale, localeCookie, localeCookieOptions } from "@/i18n/locales";
import { negotiateLocale } from "@/i18n/negotiate";
import { createEventFor, type CreateEventResult } from "./create-event";
import { siteOrigin } from "./site";

export type { CreateEventResult } from "./create-event";

/**
 * Creates an event (epic #3, R1 to R3; #599), with the session or the address its body
 * carries (`session`, `email`), as create-event.ts says. The organiser's token leaves the
 * server only here, in the result's body: never in a header nor a URL, never logged. The
 * database keeps its hash. The confirmation email goes out after the answer, by `after()`.
 */
export async function createEvent(fields: unknown): Promise<CreateEventResult> {
  const locale = await getLocale();
  return createEventFor(fields, {
    db: getDb(),
    now: new Date(),
    locale: isLocale(locale) ? locale : defaultLocale,
    origin: siteOrigin(),
    brevo: serverBrevo(),
    later: (task) => after(task),
  });
}

/**
 * Remembers the language asked for on this device (#113, decision 1). Setting the cookie
 * makes Next render the current page again in this same answer, already in that language:
 * the client applies it in place, its fragment and its state kept (decision 5). Anything
 * but a known locale sets nothing.
 */
export async function setLocale(locale: unknown): Promise<boolean> {
  if (!isLocale(locale)) return false;
  // Vercel sends `https`; `next start` sets `http` itself, where a Secure cookie would be dropped.
  const secure = (await headers()).get("x-forwarded-proto") === "https";
  (await cookies()).set(localeCookie, locale, localeCookieOptions(secure));
  return true;
}

/** What a visit says of the session: still open, or ended (or never one), which no visit brings back. */
export type VisitAnswer = { session: "open" } | { session: "ended" };

/**
 * A page load with the session's token (OA9.6, OA9.7), sent by session-visit.tsx in the
 * request's body: the session slides 90 days more, and the account notes the visit and the
 * page's language, negotiated as the page's own (src/i18n/request.ts). Nothing else is
 * answered: neither the account nor its address. The token is never logged.
 */
export async function visit(token: unknown): Promise<VisitAnswer> {
  const locale = negotiateLocale((await cookies()).get(localeCookie)?.value, (await headers()).get("accept-language"));
  try {
    const account = await visitSession(getDb(), token, locale);
    return { session: account ? "open" : "ended" };
  } catch (error) {
    // A Postgres error may carry the row: only its code is logged, none of it is thrown.
    throw databaseFailure("visit: the visit could not be stored", error);
  }
}
