/**
 * Any number in a name or a message, hidden: an assertion never prints a phone number. A
 * `tel:` link is named by its number. The only copy (#354): `e2e/without-numbers.spec.ts`
 * proves it.
 */
export const withoutNumbers = (text: string) => text.replace(/\+?\d[\d .\-()]{4,}\d/g, "<numéro>");
