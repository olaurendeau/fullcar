"use server";

import { getDb } from "@/db/client";
import { databaseFailure } from "@/db/failure";
import type { OrganiserPanelAnswer } from "@/domain/organiser-panel";
import { isPublicId } from "@/domain/public-id";
import { editEvent, type EditEventOutcome } from "../edit-event";
import { readOrganiserState } from "../organiser-state";

/**
 * The organiser area of event `id` (#3 C4.9 amended, C8.4; epic #154, O6.1; #596): the panel
 * when organiser-access.ts grants the access, the state it decides and nothing else
 * otherwise, `{ state: "invalid" }` for an unknown event. `proof` is `{ adminToken, session }`,
 * in the request's body: with `updateEvent`, the only actions that receive the admin token.
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
