/*
 * « Session ouverte avec {email}. » on the page a link leads to (OA5.2): the link's page tells the
 * bar of the root layout, which stays mounted across the App Router's navigation, that a session has
 * just opened. Nothing is stored and nothing is in the URL: a reload or a later visit finds no arrival,
 * and a bar that mounts after the note hears nothing.
 */
const listeners = new Set<() => void>();

/** A link has just opened a session in this browser, and the browser is on its way to a page. */
export function noteArrival(): void {
  for (const listener of listeners) listener();
}

/** Calls `listener` at each arrival noted from now on; the returned function stops it. */
export function onArrival(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
