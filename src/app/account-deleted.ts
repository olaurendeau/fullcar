/*
 * « Votre compte a été supprimé. » on `/`, once (OA9.5): noted in this page's memory before the
 * navigation, taken by `/` as it shows. Nothing is stored, nothing is in the URL.
 */
let accountDeleted = false;

/** « Supprimer mon compte » has succeeded: the next `/` says so. */
export function noteAccountDeleted(): void {
  accountDeleted = true;
}

/** Whether « Supprimer mon compte » has just led here; says so once. */
export function takeAccountDeleted(): boolean {
  const was = accountDeleted;
  accountDeleted = false;
  return was;
}
