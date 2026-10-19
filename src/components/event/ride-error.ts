import { RIDE_LOCATION_MAX, RIDE_NOTE_MAX, type RideError, type RideField } from "@/domain/ride";

export type RideErrorKey = "required" | "tooLong" | "invalidText" | "invalidTime" | "seats";

/**
 * The message of an error code on a field of « Proposer une voiture » (R4), under
 * `FormErrors`. A missing value is required; anything else wrong with the seats is their
 * range; `invalid` is a character the database refuses on a text, a time that is not one on the time.
 */
export function rideErrorMessage(field: RideField, error: RideError): { key: RideErrorKey; values?: { max: number } } {
  if (error === "required") return { key: error };
  if (field === "seats") return { key: "seats" };
  if (error === "tooLong") return { key: error, values: { max: field === "note" ? RIDE_NOTE_MAX : RIDE_LOCATION_MAX } };
  return { key: field === "time" ? "invalidTime" : "invalidText" };
}
