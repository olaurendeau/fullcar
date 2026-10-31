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
import { correctAddress, resendConfirmation, type CorrectionOutcome, type ResendOutcome } from "../pending-email";
import { removeAsOrganiser, type RemovePersonOutcome } from "../remove-person";

/**
 * The organiser area of event `id` (#3 C4.9 amended, C8.4; epic #154, O6.1; #596): the panel
 * when organiser-access.ts grants the access, the state it decides and nothing else
 * otherwise, `{ state: "invalid" }` for an unknown event. `proof` is `{ adminToken, session }`,
 * in the request's body: with `updateEvent`, `removePersonAsOrganiser`, `resendEmail`, `fixEmail`,
 * and `signOut` and `deleteAccount` (mes-evenements/actions.ts, which receive every admin token
 * the browser keeps), the seven actions that receive the admin token.
 * The browser sends the token it keeps (admin-token-store.ts) and its session's (#597), never one read from a URL.
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

/**
 * « Envoyer le lien » of « Corriger l'adresse » (epic #581, OA2.5): the pending event `id` waits
 * on `email` from now on, as pending-email.ts says, and the links sent to the address before are
 * deleted. `proof` is `{ adminToken, session }`, in the request's body, as for the actions
 * above. The answer waits for Brevo's, 10 s at most. Never logs a token nor an address; puts no
 * token in an answer.
 */
export async function fixEmail(id: unknown, proof: unknown, email: unknown): Promise<CorrectionOutcome> {
  const locale = await getLocale();
  try {
    return await correctAddress(id, proof, email, {
      db: getDb(),
      now: new Date(),
      locale: isLocale(locale) ? locale : defaultLocale,
      origin: siteOrigin(),
      brevo: serverBrevo(),
    });
  } catch (error) {
    // Only its code is logged: no other detail of a Postgres error leaves the server.
    throw databaseFailure("fixEmail: the address could not be corrected", error);
  }
}

/**
 * « Retirer » in « Personnes inscrites » (#672, remove-person v2, RP3.2, RP4): anyone of event
 * `id` removed, when organiser-access.ts grants `proof` (`{ adminToken, session }`) the organiser
 * area, before the Event's lock and under it; `removeAsOrganiser` gives the answers. `deviceToken`,
 * the page's personal token, only chooses the board answered: no personal token opens this path
 * (RP3.3). Everything arrives in the body, the person's id too, never in the URL. A malformed id
 * reads nothing. Never logs a token, never puts one in an answer nor in an error.
 */
export async function removePersonAsOrganiser(id: unknown, proof: unknown, deviceToken: unknown, personId: unknown): Promise<RemovePersonOutcome> {
  if (!isPublicId(id)) return { ok: false, error: "eventNotFound" };
  try {
    return await removeAsOrganiser(getDb(), id, proof, deviceToken, { personId });
  } catch (error) {
    // A Postgres error may carry the row: only its code is logged, none of it is thrown.
    throw databaseFailure("removePersonAsOrganiser: the person could not be removed", error);
  }
}
