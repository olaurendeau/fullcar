import { LOCATION_MAX, TITLE_MAX, type EventError, type EventField } from "@/domain/event";

export type EventErrorKey =
  | Exclude<EventError, "invalid">
  | "invalidText"
  | "invalidDate"
  | "invalidTime";

/**
 * The message of an error code on a field, under `CreateEvent.errors`. `invalid` says
 * what is wrong with that field: on a text, a character the database refuses (#17).
 */
export function eventErrorMessage(
  field: EventField,
  error: EventError,
): { key: EventErrorKey; values?: { max: number } } {
  if (error === "tooLong") return { key: error, values: { max: field === "title" ? TITLE_MAX : LOCATION_MAX } };
  if (error !== "invalid") return { key: error };
  if (field === "title" || field === "location") return { key: "invalidText" };
  return { key: field.endsWith("Date") ? "invalidDate" : "invalidTime" };
}
