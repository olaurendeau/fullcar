import { optionalText, type TextError } from "./text";

/**
 * The event's description: free text from the organiser, optional, with its line breaks
 * (event-description v3, « Écrire »). One normalisation, safe in the browser, shared by the
 * server, which stores it, and the counter, which shows what the server would count.
 */

/** At most, in code points after normalisation: an emoji counts as one. */
export const DESCRIPTION_MAX = 1000;

/** Blanks at the end of a line: tabs and the Unicode Zs spaces, non-breaking ones included. */
const LINE_END_BLANKS = /[\t\p{Zs}]+(?=\n|$)/gu;

/**
 * The text as it is stored: `\r\n` and `\r` become `\n`, blanks at the end of each line go,
 * three newlines or more become two, and the whole is trimmed. Spaces and tabs inside a line
 * stay, since the page shows them as typed (`pre-wrap`).
 */
export function normalizeDescription(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(LINE_END_BLANKS, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The description to store, or the error. `text()`'s rules after normalisation: text without
 * a visible character is no description (`null`), a NUL or a value that is not a string is
 * `invalid`, more than `DESCRIPTION_MAX` code points is `tooLong`.
 */
export function description(value: unknown): { value: string | null } | { error: TextError } {
  return optionalText(typeof value === "string" ? normalizeDescription(value) : value, DESCRIPTION_MAX);
}

/** What the counter shows for the field's value: the length the server would store, beyond the maximum too. */
export function descriptionCount(field: string): number {
  const normalized = normalizeDescription(field);
  const read = optionalText(normalized, Infinity);
  return "value" in read && read.value === null ? 0 : [...normalized].length;
}

/** Lines beyond which the header folds the description. */
const FOLDED_LINES = 4;

/** Code points beyond which the server guesses the text takes more than 4 lines at 360 px. */
const FOLDED_LENGTH = 140;

/**
 * The server's guess, before the browser measures: whether to render the « Afficher toute la
 * description » button. More than 4 lines by `\n`, or more than 140 code points.
 */
export function guessFolds(description: string): boolean {
  return description.split("\n").length > FOLDED_LINES || [...description].length > FOLDED_LENGTH;
}
