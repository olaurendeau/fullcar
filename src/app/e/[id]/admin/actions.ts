"use server";

import { getDb } from "@/db/client";
import { databaseFailure } from "@/db/failure";
import type { OrganiserPanelAnswer } from "@/domain/organiser-panel";
import { isPublicId } from "@/domain/public-id";
import { editEvent, type EditEventOutcome } from "../edit-event";
import { readOrganiserState } from "../organiser-state";

/**
 * The organiser area of event `id` (#3 C4.9 amended, C8.4; epic #154, O6.1): the panel when
 * `token` is the event's admin token, `{ state: "invalid" }` and nothing else otherwise.
 * The client reads the token from the URL's fragment and sends it here, in the request's
 * body: with `updateEvent`, the only actions that receive it. A malformed id reads nothing; a token
 * that is not a string is refused by the comparison. Never logs the token nor the panel,
 * never puts either in an error.
 */
export async function loadOrganiserPanel(id: unknown, token: unknown): Promise<OrganiserPanelAnswer> {
  if (!isPublicId(id)) return { state: "invalid" };
  try {
    return await readOrganiserState(getDb(), id, token);
  } catch (error) {
    // Only its code is logged: no other detail of a Postgres error leaves the server.
    throw databaseFailure("loadOrganiserPanel: the panel could not be read", error);
  }
}

/**
 * The organiser changes event `id` (epic #250): `fields` as the form sends them, `before`
 * the values the page loaded, `removal` the numbers a confirmation of the retour's removal
 * showed. Everything arrives in the request's body, the token with it, read from the URL's
 * fragment; `editEvent` gives the answers. A malformed id reads nothing. Never logs the
 * token, never puts it in an answer nor in an error.
 */
export async function updateEvent(
  id: unknown,
  token: unknown,
  fields: unknown,
  before: unknown,
  removal?: unknown,
): Promise<EditEventOutcome> {
  if (!isPublicId(id)) return { ok: false, error: "eventNotFound" };
  try {
    return await editEvent(getDb(), id, token, fields, before, removal);
  } catch (error) {
    // Only its code is logged: no other detail of a Postgres error leaves the server.
    throw databaseFailure("updateEvent: the event could not be changed", error);
  }
}
