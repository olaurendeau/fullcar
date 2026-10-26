import { DESCRIPTION_MAX } from "@/domain/description";
import { LOCATION_MAX, TITLE_MAX, type EventError, type EventField } from "@/domain/event";

export type EventErrorKey =
  | Exclude<EventError, "invalid">
  | "invalidText"
  | "invalidDate"
  | "invalidTime";

/** The longest text each text field takes. */
const MAX: Partial<Record<EventField, number>> = { title: TITLE_MAX, location: LOCATION_MAX, description: DESCRIPTION_MAX };

/**
 * The message of an error code on a field, under `CreateEvent.errors`. `invalid` says
 * what is wrong with that field: on a text, a character the database refuses (#17), or a
 * value that is not text at all, which only a forged request sends.
 */
export function eventErrorMessage(
  field: EventField,
  error: EventError,
): { key: EventErrorKey; values?: { max: number } } {
  const max = MAX[field];
  if (error === "tooLong") return { key: error, values: { max: max ?? LOCATION_MAX } };
  if (error !== "invalid") return { key: error };
  if (max !== undefined) return { key: "invalidText" };
  return { key: field.endsWith("Date") ? "invalidDate" : "invalidTime" };
}
