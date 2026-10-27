"use server";

import { getDb } from "@/db/client";
import { databaseFailure } from "@/db/failure";
import { readMyEvents, type MyEventsAnswer } from "./my-events";

/**
 * « Mes événements » (OA6.1–OA6.8), called by the page once loaded with the session's token
 * from session-token.ts, in the request's body: never in a URL, a header or a cookie. The
 * answer carries the account's address and its events' own fields and numbers, never a
 * token nor a phone number; nothing logged carries either.
 */
export async function myEvents(token: unknown): Promise<MyEventsAnswer> {
  try {
    return await readMyEvents(getDb(), token);
  } catch (error) {
    // A Postgres error may carry a row: only its code is logged, none of it is thrown.
    throw databaseFailure("myEvents: the events could not be read", error);
  }
}
