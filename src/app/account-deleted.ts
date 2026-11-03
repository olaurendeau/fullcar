/*
 * « Votre compte a été supprimé. » on `/`, once (OA9.5): noted in this page's memory before the
 * navigation, read by `/` as it renders, forgotten once it shows. Nothing is stored, nothing is in
 * the URL. Reading takes nothing: React may render `/` twice (a transition thrown away under load
 * and rendered again), and a render that took the note would leave the second one nothing to say.
 */
let accountDeleted = false;

/** « Supprimer mon compte » has succeeded: the next `/` says so. */
export function noteAccountDeleted(): void {
  accountDeleted = true;
}

/** Whether « Supprimer mon compte » has just led here. A render, so it changes nothing. */
export function peekAccountDeleted(): boolean {
  return accountDeleted;
}

/** `/` shows it: a reload or a later visit says nothing. Called once the page is committed. */
export function forgetAccountDeleted(): void {
  accountDeleted = false;
}
