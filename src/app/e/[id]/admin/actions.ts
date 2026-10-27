"use server";

import { getLocale } from "next-intl/server";
import { siteOrigin } from "@/app/site";
import { getDb } from "@/db/client";
import { databaseFailure } from "@/db/failure";
import type { OrganiserPanelAnswer } from "@/domain/organiser-panel";
import { isPublicId } from "@/domain/public-id";
import { serverBrevo } from "@/email/brevo";
import { defaultLocale, isLocale } from "@/i18n/locales";
import { editEvent, type EditEventOutcome } from "../edit-event";
import { readOrganiserState } from "../organiser-state";
import { resendConfirmation, type ResendOutcome } from "../pending-email";

/**
 * The organiser area of event `id` (#3 C4.9 amended, C8.4; epic #154, O6.1; #596): the panel
 * when organiser-access.ts grants the access, the state it decides and nothing else
 * otherwise, `{ state: "invalid" }` for an unknown event. `proof` is `{ adminToken, session }`,
 * in the request's body: with `updateEvent`, `signOut` (mes-evenements/actions.ts) and `resendEmail`, the
 * only actions that receive the admin token.
 * The client still reads that token from the URL's fragment, and sends no session yet (#597).
 * A malformed id reads nothing; a token that is not a string is refused by the comparison.
 * Never logs a token nor the panel, never puts either in an error.
 */
export async function loadOrganiserPanel(id: unknown, proof: unknown): Promise<OrganiserPanelAnswer> {
  if (!isPublicId(id)) return { state: "invalid" };
  try {
    return await readOrganiserState(getDb(), id, proof);
  } catch (error) {
    // Only its code is logged: no other detail of a Postgres error leaves the server.
    throw databaseFailure("loadOrganiserPanel: the panel could not be read", error);
  }
}

/**
 * The organiser changes event `id` (epic #250): `fields` as the form sends them, `before`
 * the values the page loaded, `removal` the numbers a confirmation of the retour's removal
 * showed. Everything arrives in the request's body, `proof` (`{ adminToken, session }`) with
 * it; `editEvent` gives the answers. A malformed id reads nothing. Never logs a token, never
 * puts one in an answer nor in an error.
 */
export async function updateEvent(
  id: unknown,
  proof: unknown,
  fields: unknown,
  before: unknown,
  removal?: unknown,
): Promise<EditEventOutcome> {
  if (!isPublicId(id)) return { ok: false, error: "eventNotFound" };
  try {
    return await editEvent(getDb(), id, proof, fields, before, removal);
  } catch (error) {
    // Only its code is logged: no other detail of a Postgres error leaves the server.
    throw databaseFailure("updateEvent: the event could not be changed", error);
  }
}

/**
 * « Renvoyer l'e-mail » (epic #581, OA2.4): one more confirmation email for the pending event
 * `id`, as pending-email.ts says, in the page's language. `proof` is `{ adminToken, session }`,
 * in the request's body, as for the two actions above. The answer waits for Brevo's, 10 s at
 * most. Never logs a token nor an address; puts no token in an answer.
 */
export async function resendEmail(id: unknown, proof: unknown): Promise<ResendOutcome> {
  const locale = await getLocale();
  try {
    return await resendConfirmation(id, proof, {
      db: getDb(),
      now: new Date(),
      locale: isLocale(locale) ? locale : defaultLocale,
      origin: siteOrigin(),
      brevo: serverBrevo(),
    });
  } catch (error) {
    // Only its code is logged: no other detail of a Postgres error leaves the server.
    throw databaseFailure("resendEmail: the email could not be sent again", error);
  }
}
