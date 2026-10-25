/**
 * An organiser's email address (epic #581): what /nouveau, /connexion and the
 * correction of an address read, in the browser and on the server alike (OA1.4).
 * One address is one account: it is written one way only, trimmed, lowercased,
 * in NFC.
 */

/** RFC 5321: 254 characters, the longest path a mail server accepts. */
export const EMAIL_MAX = 254;

/** Error codes, translated by the view: « Champ requis. », « Adresse e-mail non valide. », « 254 caractères au maximum. ». */
export type EmailError = "required" | "invalid" | "tooLong";

/** Letters, digits and combining marks of any script: an address may be internationalised. */
const ALNUM = "\\p{L}\\p{N}\\p{M}";

/** The characters of `type="email"` (WHATWG) before the @, and letters of any script; 64 at most (RFC 5321). */
const LOCAL = `[${ALNUM}.!#$%&'*+/=?^_\`{|}~-]{1,64}`;

/** A label of `type="email"`: 63 characters at most, no hyphen at either end. */
const LABEL = `[${ALNUM}](?:[${ALNUM}-]{0,61}[${ALNUM}])?`;

/**
 * The address `type="email"` accepts, with two more rules: the domain has a dot, and its
 * last label is not only digits. Brevo cannot deliver to `camille@localhost` nor to an IP.
 */
const FORMAT = new RegExp(`^${LOCAL}@(?:${LABEL}\\.)+(?!\\p{N}+$)${LABEL}$`, "u");

/**
 * The address written one way, or the error. Length is counted after normalisation, in
 * code points. `undefined`, `null` and blank are a missing field; any other value that is
 * not a string comes from a forged request: invalid, never an exception.
 */
export function emailAddress(value: unknown): { value: string } | { error: EmailError } {
  const raw = value ?? "";
  if (typeof raw !== "string") return { error: "invalid" };
  const address = raw.trim().toLowerCase().normalize("NFC");
  if (address === "") return { error: "required" };
  if ([...address].length > EMAIL_MAX) return { error: "tooLong" };
  if (!FORMAT.test(address)) return { error: "invalid" };
  return { value: address };
}
