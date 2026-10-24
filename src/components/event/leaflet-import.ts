/*
 * Leaflet's import, one for the page (event-map, « Leaflet échoue encore », CA2.10): the legs'
 * maps read one state, nothing asked for, loading, failed or loaded, and the failures in a
 * row, through `useSyncExternalStore`. One attempt at a time: two legs opened ask once for the
 * module. An attempt starts only at a map's opening or on « Réessayer » (CA1.2 unchanged).
 */
import { LEAFLET_IDLE, leafletStep, type LeafletEvent, type LeafletState } from "./event-map-state";

export interface LeafletSnapshot<Library> {
  state: LeafletState;
  /** The module, once loaded. */
  library: Library | null;
}

/** A change of the page's import, told to each listener before React draws it: the focus a box has is still there. */
export interface LeafletChange {
  before: LeafletState;
  event: LeafletEvent;
  after: LeafletState;
}

export interface LeafletImport<Library> {
  /** `useSyncExternalStore`'s, and the legs' own, which read `change`. */
  subscribe: (listener: (change: LeafletChange) => void) => () => void;
  snapshot: () => LeafletSnapshot<Library>;
  /** Before hydration, and on the server: nothing asked for. */
  serverSnapshot: () => LeafletSnapshot<Library>;
  /** A map opened: the first attempt, if none was made. */
  open: () => void;
  /** « Réessayer », from either leg: an attempt, after a failure only. */
  retry: () => void;
}

/** The import made by `load`, with `online` read at each failure (`navigator.onLine`). */
export function createLeafletImport<Library>(load: () => Promise<Library>, online: () => boolean): LeafletImport<Library> {
  const idle: LeafletSnapshot<Library> = { state: LEAFLET_IDLE, library: null };
  let snapshot = idle;
  const listeners = new Set<(change: LeafletChange) => void>();

  const apply = (event: LeafletEvent, library: Library | null = snapshot.library) => {
    const before = snapshot.state;
    const after = leafletStep(before, event, event === "failed" && online());
    if (after === before) return;
    snapshot = { state: after, library };
    for (const listener of [...listeners]) listener({ before, event, after });
    if (after.phase === "loading") {
      load().then(
        (loaded) => apply("loaded", loaded),
        () => apply("failed"),
      );
    }
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => snapshot,
    serverSnapshot: () => idle,
    open: () => apply("open"),
    retry: () => apply("retry"),
  };
}

/** The page's: `./leaflet-map`, and Leaflet with it, in a chunk of its own. */
export const leafletImport = createLeafletImport(() => import("./leaflet-map"), () => navigator.onLine);
