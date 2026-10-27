/*
 * « Session fermée. » on /connexion, once, after « Se déconnecter » (OA9.1): noted before the
 * App Router's navigation, in this page's memory, and taken by /connexion as it shows. A reload
 * or a later visit finds nothing; nothing is stored, nothing is in the URL.
 */
let signedOut = false;

/** « Se déconnecter » has succeeded: the next /connexion says so. */
export function noteSignedOut(): void {
  signedOut = true;
}

/** Whether « Se déconnecter » has just led here; says so once. */
export function takeSignedOut(): boolean {
  const was = signedOut;
  signedOut = false;
  return was;
}
