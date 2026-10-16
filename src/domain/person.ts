/**
 * The rules of a Person (epic #66, R1): the form "Ajouter une personne", and the new
 * driver of R4. The same rules run in the browser and on the server.
 */
import { optionalText, text, type TextError } from "./text";

export const FIRST_NAME_MAX = 40;
/** Characters, after trimming; the migration holds the same bounds. */
export const PHONE_MAX = 25;
export const PHONE_DIGITS_MIN = 6;
export const PHONE_DIGITS_MAX = 15;

/** Digits, spaces and `+ . - ( )`, nothing else. */
const PHONE_CHARACTERS = /^[0-9 +.()-]+$/;

/** The fields that can carry an error, in the order of the form: the first one gets the focus. */
export const PERSON_FIELDS = ["firstName", "phone"] as const;
export type PersonField = (typeof PERSON_FIELDS)[number];

/** Error codes, translated by the view. */
export type PersonError = TextError;
export type PersonErrors = Partial<Record<PersonField, PersonError>>;

/**
 * What the form sends: text, or nothing, which counts as empty. Typed `unknown`, since a
 * forged request can send anything; a value that is not text is `invalid`.
 */
export interface PersonFields {
  firstName?: unknown;
  phone?: unknown;
}

export interface NewPerson {
  firstName: string;
  /** `null` when the field is left empty. */
  phone: string | null;
}

export type PersonValidation =
  | { ok: true; person: NewPerson }
  | { ok: false; errors: PersonErrors; first: PersonField };

function phone(value: unknown): { value: string | null } | { error: PersonError } {
  const read = optionalText(value, PHONE_MAX);
  if ("error" in read || read.value === null) return read;
  if (!PHONE_CHARACTERS.test(read.value)) return { error: "invalid" };
  const digits = read.value.replace(/[^0-9]/g, "").length;
  if (digits < PHONE_DIGITS_MIN || digits > PHONE_DIGITS_MAX) return { error: "invalid" };
  return read;
}

export function validatePerson(fields: PersonFields): PersonValidation {
  const firstName = text(fields.firstName, FIRST_NAME_MAX);
  const checkedPhone = phone(fields.phone);

  if ("error" in firstName || "error" in checkedPhone) {
    const errors: PersonErrors = {};
    if ("error" in firstName) errors.firstName = firstName.error;
    if ("error" in checkedPhone) errors.phone = checkedPhone.error;
    // In the order of PERSON_FIELDS.
    return { ok: false, errors, first: "error" in firstName ? "firstName" : "phone" };
  }
  return { ok: true, person: { firstName: firstName.value, phone: checkedPhone.value } };
}
