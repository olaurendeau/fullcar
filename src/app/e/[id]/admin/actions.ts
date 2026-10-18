"use server";

import { getDb } from "@/db/client";
import { databaseFailure } from "@/db/failure";
import type { OrganiserPanelAnswer } from "@/domain/organiser-panel";
import { isPublicId } from "@/domain/public-id";
import { readOrganiserState } from "../organiser-state";

/**
 * The organiser area of event `id` (#3 C4.9 amended, C8.4; epic #154, O6.1): the panel when
 * `token` is the event's admin token, `{ state: "invalid" }` and nothing else otherwise.
 * The client reads the token from the URL's fragment and sends it here, in the request's
 * body: this is the only action that receives it. A malformed id reads nothing; a token
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
