"use server";

import { getDb } from "@/db/client";
import { databaseFailure } from "@/db/failure";
import { isPublicId } from "@/domain/public-id";
import * as changeRide from "./change-ride";
import { readEventState, type EventState } from "./event-state";
import * as persons from "./persons";
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

/**
 * The person actions (R1 to R3, R7) run a use case of persons.ts: the state after the
 * change, field errors, or a refusal key. Anything is read as input without throwing; the
 * token arrives in the body, and is only hashed or compared, never logged. A malformed
 * event id reads nothing.
 */
async function changePerson(
  name: string,
  change: typeof persons.addPerson,
  id: unknown,
  token: unknown,
  fields: unknown,
): Promise<persons.PersonOutcome> {
  if (!isPublicId(id)) return { ok: false, error: "eventNotFound" };
  try {
    return await change(getDb(), id, token, fields);
  } catch (error) {
    // A Postgres error may carry the row: only its code is logged, none of it is thrown.
    throw databaseFailure(`${name}: the change could not be written`, error);
  }
}

/** Registers a person: first name, number, « Aller et retour », the tab's leg, and the creation id. */
export async function addPerson(id: unknown, token: unknown, fields: unknown): Promise<persons.PersonOutcome> {
  return changePerson("addPerson", persons.addPerson, id, token, fields);
}

/** Changes the first name and the number of one of the device's persons. */
export async function updatePerson(id: unknown, token: unknown, fields: unknown): Promise<persons.PersonOutcome> {
  return changePerson("updatePerson", persons.updatePerson, id, token, fields);
}

/** Without a car, or not concerned, on one leg, for one of the device's persons. */
export async function setPersonLeg(id: unknown, token: unknown, fields: unknown): Promise<persons.PersonOutcome> {
  return changePerson("setPersonLeg", persons.setPersonLeg, id, token, fields);
}

/**
 * The driver changes their car (R8, C8.2 to C8.5). `fields` carries the form's fields and
 * its step's lists: the passengers it showed (`seenPassengerIds`) and who leaves
 * (`leaving`). The token arrives in the body, never in the URL; it is only compared, never
 * logged. Nothing for an unknown event or a malformed id.
 */
export async function updateRide(
  id: unknown,
  token: unknown,
  rideId: unknown,
  leg: unknown,
  fields: unknown,
): Promise<changeRide.UpdateRideResult | undefined> {
  if (!isPublicId(id)) return undefined;
  try {
    return await changeRide.updateRide(getDb(), id, token, rideId, leg, fields);
  } catch (error) {
    // A Postgres error may carry the row: only its code is logged, none of it is thrown.
    throw databaseFailure("updateRide: the car could not be changed", error);
  }
}

/** The driver removes their car (C8.6); removing it again succeeds. As for updateRide. */
export async function removeRide(
  id: unknown,
  token: unknown,
  rideId: unknown,
  leg: unknown,
): Promise<changeRide.RemoveRideResult | undefined> {
  if (!isPublicId(id)) return undefined;
  try {
    return await changeRide.removeRide(getDb(), id, token, rideId, leg);
  } catch (error) {
    throw databaseFailure("removeRide: the car could not be removed", error);
  }
}
