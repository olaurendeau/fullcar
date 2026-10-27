/**
 * The rules of a Person (epic #66, R1): the form "Ajouter une personne", and the new
 * driver of R4, whose number is required (v4.8). The same rules run in the browser and on
 * the server.
 */
import { optionalText, text, type TextError } from "./text";

export const FIRST_NAME_MAX = 40;
/** Characters, after cleaning and trimming; the migration holds the same bounds. */
export const PHONE_MAX = 25;
export const PHONE_DIGITS_MIN = 6;
export const PHONE_DIGITS_MAX = 15;

/** Digits, spaces and `+ . - ( )`, nothing else. */
const PHONE_CHARACTERS = /^[0-9 +.()-]+$/;

/** Invisible format characters (`\p{Cf}`): bidi marks from iOS contacts, zero-width spaces, BOM. */
const FORMAT_CHARACTERS = /\p{Cf}/gu;
/** Space separators (`\p{Zs}`): no-break, narrow no-break and figure spaces among them. */
const SPACE_SEPARATORS = /\p{Zs}/gu;

/**
 * A phone pasted from a contact list carries characters nobody sees (#123): the format
 * characters go, every space separator becomes a plain space. The phone only: the other
 * free texts keep their invisible characters, since an emoji sequence needs its joiners.
 */
function cleanPhone(value: unknown): unknown {
  return typeof value === "string" ? value.replace(FORMAT_CHARACTERS, "").replace(SPACE_SEPARATORS, " ") : value;
}

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
  // Cleaned first, so that the limits and the stored value apply to the cleaned phone.
  const read = optionalText(cleanPhone(value), PHONE_MAX);
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

/**
 * A new person who drives (R4, v4.8 rule 6): the rules of `validatePerson`, and a number is
 * `required`, so that the people on board can reach her.
 */
export function validateDriver(fields: PersonFields): PersonValidation {
  const checked = validatePerson(fields);
  const read = phone(fields.phone);
  if ("error" in read || read.value !== null) return checked;
  // Empty: required, after the first name's error, if any.
  const errors: PersonErrors = { ...(checked.ok ? {} : checked.errors), phone: "required" };
  return { ok: false, errors, first: errors.firstName ? "firstName" : "phone" };
}

/**
 * A change of a person (C2.3): a field left out (`undefined`) stays as it is, so that a form
 * filled before another change landed does not undo it; the others follow `validatePerson`.
 */
export function validatePersonChange(fields: PersonFields) {
  // A first name left out is read as a valid one, then left out of the change.
  const checked = validatePerson({ ...fields, firstName: fields.firstName === undefined ? "-" : fields.firstName });
  if (!checked.ok) return checked;
  const given = PERSON_FIELDS.filter((name) => fields[name] !== undefined);
  const change: Partial<NewPerson> = Object.fromEntries(given.map((name) => [name, checked.person[name]]));
  return { ok: true as const, change };
}
