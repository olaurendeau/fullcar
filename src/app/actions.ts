"use server";

import { cookies, headers } from "next/headers";
import { getDb } from "@/db/client";
import { insertEvent } from "@/db/events";
import { databaseFailure } from "@/db/failure";
import { hashAdminToken, newAdminToken } from "@/domain/admin-token";
import { eventFieldsOf, serverBounds, validateEvent, type EventErrors } from "@/domain/event";
import { isLocale, localeCookie, localeCookieOptions } from "@/i18n/locales";

export type CreateEventResult = { ok: true; id: string; token: string } | { ok: false; errors: EventErrors };

/**
 * Creates an event (epic #3, R1 to R3), checked against the server's own date bounds.
 * The organiser's token leaves the server only here, in the result's body: never in a
 * header nor a URL, never logged. The database keeps its hash.
 */
export async function createEvent(fields: unknown): Promise<CreateEventResult> {
  const validation = validateEvent(eventFieldsOf(fields), serverBounds(new Date()));
  if (!validation.ok) return validation;

  const token = newAdminToken();
  let id: string;
  try {
    id = await insertEvent(getDb(), validation.event, hashAdminToken(token));
  } catch (error) {
    // A Postgres error may carry the row: only its code is logged, none of it is thrown.
    throw databaseFailure("createEvent: the event could not be stored", error);
  }
  return { ok: true, id, token };
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
