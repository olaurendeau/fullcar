"use server";

import { getLocale } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { getDb } from "@/db/client";
import { serverBrevo } from "@/email/brevo";
import { defaultLocale, isLocale, localeCookie, localeCookieOptions } from "@/i18n/locales";
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
