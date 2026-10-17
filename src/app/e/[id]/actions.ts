"use server";

import { getDb } from "@/db/client";
import { databaseFailure } from "@/db/failure";
import { isPublicId } from "@/domain/public-id";
import { readEventState, type EventState } from "./event-state";
import { takeSeats as takeSeatsInRide, type TakeSeatsResult } from "./seats";

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

/**
 * Takes seats in a Ride for persons of the device (C5.2, C6.4), and always gives the state
 * the device now sees, refusal included. The token arrives in the body, never in the URL;
 * it is only compared, never logged. Nothing for an unknown event or a malformed id.
 */
export async function takeSeats(
  id: unknown,
  token: unknown,
  rideId: unknown,
  leg: unknown,
  personIds: unknown,
): Promise<TakeSeatsResult | undefined> {
  if (!isPublicId(id)) return undefined;
  try {
    return await takeSeatsInRide(getDb(), id, token, rideId, leg, personIds);
  } catch (error) {
    // A Postgres error may carry the row: only its code is logged, none of it is thrown.
    throw databaseFailure("takeSeats: the seats could not be taken", error);
  }
}
