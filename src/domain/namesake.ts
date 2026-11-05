/**
 * Two first names are the same one (RL6.1): equal once trimmed, without accents, in lower case.
 * Inner spaces count. Shared by « Ajouter une personne » (RL6.4) and « Qui conduit ? » (RL6.2).
 */
const MARKS = /\p{M}/gu;

function key(name: string): string {
  return name.trim().normalize("NFD").replace(MARKS, "").toLowerCase();
}

export function sameFirstName(a: string, b: string): boolean {
  return key(a) === key(b);
}

/** The first of `persons` who has the typed first name, or `undefined`; an empty name matches nobody. */
export function namesake<T extends { firstName: string }>(persons: readonly T[], typed: string): T | undefined {
  if (!typed.trim()) return undefined;
  return persons.find(({ firstName }) => sameFirstName(firstName, typed));
}
