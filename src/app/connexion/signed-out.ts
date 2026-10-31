/*
 * « Session fermée. » on /connexion, once, after « Se déconnecter » (OA9.1): noted before the
 * App Router's navigation, in this page's memory, read by /connexion as it renders and forgotten
 * once it shows. A reload or a later visit finds nothing; nothing is stored, nothing is in the
 * URL. Reading takes nothing: React may render the page twice (a transition thrown away under
 * load and rendered again), and a render that took the note would leave the second one nothing.
 */
let signedOut = false;

/** « Se déconnecter » has succeeded: the next /connexion says so. */
export function noteSignedOut(): void {
  signedOut = true;
}

/** Whether « Se déconnecter » has just led here. A render, so it changes nothing. */
export function peekSignedOut(): boolean {
  return signedOut;
}

/** /connexion shows it: a reload or a later visit says nothing. Called once the page is committed. */
export function forgetSignedOut(): void {
  signedOut = false;
}
