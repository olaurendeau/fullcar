/**
 * Free text typed in a form: a title, a first name, a place, a note. The same reading
 * everywhere, so that "empty" and "too long" mean the same thing in every form.
 */

/** Error codes, translated by the view. */
export type TextError = "required" | "tooLong" | "invalid";

/**
 * Nothing to see: whitespace, separators (`\p{Z}`), and format (`\p{Cf}`) or control
 * (`\p{Cc}`) characters, such as zero-width spaces and joiners, which trim() keeps.
 */
const INVISIBLE = /^[\s\p{Z}\p{Cf}\p{Cc}]*$/u;

/** Postgres refuses it in a `text`: only a forged request can send it. */
const NUL = "\u0000";

/**
 * Trimmed text, or the error. Text without a visible character is empty; inside visible
 * text, invisible characters stay, since an emoji sequence needs its joiners.
 * Length in code points, so that an emoji counts as one. `undefined` and `null` are empty;
 * any other value that is not a string comes from a forged request: invalid, not an exception.
 */
export function text(value: unknown, max: number): { value: string } | { error: TextError } {
  const raw = value ?? "";
  if (typeof raw !== "string") return { error: "invalid" };
  const trimmed = raw.trim();
  if (trimmed.includes(NUL)) return { error: "invalid" };
  if (INVISIBLE.test(trimmed)) return { error: "required" };
  if ([...trimmed].length > max) return { error: "tooLong" };
  return { value: trimmed };
}

/** The same for a field that may stay empty: empty, it is `null`. */
export function optionalText(value: unknown, max: number): { value: string | null } | { error: TextError } {
  const result = text(value, max);
  return "error" in result && result.error === "required" ? { value: null } : result;
}
