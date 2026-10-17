"use server";

import { getDb } from "@/db/client";
import { databaseFailure } from "@/db/failure";
import { isPublicId } from "@/domain/public-id";
import { readEventState, type EventState } from "./event-state";

/**
 * The event's state as this device sees it, for the browser to replace the one rendered
 * by the server. The personal token arrives in the body, never in the URL; it is only
 * compared, never logged. Nothing for an unknown event, and a malformed id reads nothing.
 */
export async function loadEventState(id: unknown, token: unknown): Promise<EventState | undefined> {
  if (!isPublicId(id)) return undefined;
  try {
    return await readEventState(getDb(), id, token);
  } catch (error) {
    // A Postgres error may carry the row: only its code is logged, none of it is thrown.
    throw databaseFailure("loadEventState: the event could not be read", error);
  }
}
