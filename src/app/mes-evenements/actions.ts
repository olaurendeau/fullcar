"use server";

import { getDb } from "@/db/client";
import { databaseFailure } from "@/db/failure";
import { deleteAccountOf, type DeleteAccountAnswer } from "./delete-account";
import { readMyEvents, type MyEventsAnswer } from "./my-events";
import { signOutBrowser, type SignOutAnswer } from "./sign-out";

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

/**
 * « Se déconnecter » in « Mon compte » (OA9.1): the session's token and the admin tokens this
 * browser keeps, from session-token.ts and admin-token-store.ts, arrive in the request's body,
 * never in a URL, a header or a cookie. The answer carries no token; nothing logged carries one.
 */
export async function signOut(session: unknown, adminTokens: unknown): Promise<SignOutAnswer> {
  try {
    return await signOutBrowser(getDb(), session, adminTokens);
  } catch (error) {
    // A Postgres error may carry a row: only its code is logged, none of it is thrown.
    throw databaseFailure("signOut: the session could not be closed", error);
  }
}

/**
 * « Supprimer mon compte » in « Mon compte » (OA9.3 to OA9.5): the session's token and the admin
 * tokens this browser keeps arrive in the request's body, never in a URL, a header or a cookie.
 * The answer carries no token nor address; nothing logged carries one.
 */
export async function deleteAccount(session: unknown, adminTokens: unknown): Promise<DeleteAccountAnswer> {
  try {
    return await deleteAccountOf(getDb(), session, adminTokens);
  } catch (error) {
    // A Postgres error may carry a row: only its code is logged, none of it is thrown.
    throw databaseFailure("deleteAccount: the account could not be deleted", error);
  }
}
