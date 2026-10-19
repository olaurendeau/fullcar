import { FIRST_NAME_MAX, PHONE_MAX, type PersonError, type PersonField } from "@/domain/person";

export type PersonErrorKey = Exclude<PersonError, "invalid"> | "invalidText" | "invalidPhone";

/**
 * The message of an error code on a field of « Ajouter une personne », under `FormErrors`.
 * `invalid` says what is wrong with that field: on the first name, a character the database
 * refuses; on the number, what a valid one is (R1).
 */
export function personErrorMessage(
  field: PersonField,
  error: PersonError,
): { key: PersonErrorKey; values?: { max: number } } {
  if (error === "tooLong") return { key: error, values: { max: field === "firstName" ? FIRST_NAME_MAX : PHONE_MAX } };
  if (error !== "invalid") return { key: error };
  return { key: field === "firstName" ? "invalidText" : "invalidPhone" };
}
