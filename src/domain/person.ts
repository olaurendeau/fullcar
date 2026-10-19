/**
 * The rules of a Person (epic #66, R1): the form "Ajouter une personne", and the new
 * driver of R4. The same rules run in the browser and on the server.
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

/** A new person: a field left out, or `null`, is empty. */
export function validatePerson(fields: PersonFields): PersonValidation {
  const checked = validatePersonChange({ firstName: fields.firstName ?? null, phone: fields.phone ?? null });
  return checked.ok ? { ok: true, person: checked.change as NewPerson } : checked;
}

export type PersonChangeValidation =
  | { ok: true; change: Partial<NewPerson> }
  | { ok: false; errors: PersonErrors; first: PersonField };

/**
 * A change of a person (C2.3): a field left out (`undefined`) stays as it is, so that a form
 * filled before another change landed does not undo it; the others follow `validatePerson`.
 */
export function validatePersonChange(fields: PersonFields): PersonChangeValidation {
  const read = {
    firstName: fields.firstName === undefined ? undefined : text(fields.firstName, FIRST_NAME_MAX),
    phone: fields.phone === undefined ? undefined : phone(fields.phone),
  };
  const errors: PersonErrors = {};
  const change: Partial<NewPerson> = {};
  for (const name of PERSON_FIELDS) {
    const value = read[name];
    if (value !== undefined && "error" in value) errors[name] = value.error;
    else if (value !== undefined) Object.assign(change, { [name]: value.value });
  }
  // In the order of PERSON_FIELDS.
  const first = PERSON_FIELDS.find((name) => errors[name] !== undefined);
  return first === undefined ? { ok: true, change } : { ok: false, errors, first };
}
