import { useEffect, useSyncExternalStore } from "react";

/*
 * Whether a sheet hides the rest of the page (#193, #195). Radix hides it from screen readers
 * from the mount of a sheet's content to its unmount, its closing animation included, and the
 * message bar is under the sheet: a message written there meanwhile is neither seen nor heard.
 */
let sheets = 0;
let waiting: (() => void) | null = null;
const watchers = new Set<() => void>();
const changed = () => watchers.forEach((watcher) => watcher());

/** In the content of every sheet (`BottomSheet`): the page is hidden while it is mounted. */
export function HidesPage() {
  useEffect(() => {
    sheets += 1;
    changed();
    return () => {
      sheets -= 1;
      // Once the commit is over: a sheet that took this one's place in it hides the page still.
      queueMicrotask(() => {
        if (sheets > 0) return;
        changed();
        if (!waiting) return;
        const then = waiting;
        waiting = null;
        then();
      });
    };
  }, []);
  return null;
}

/**
 * Whether a sheet hides the page now, for a live region outside the bar (#182): what it says
 * waits for the page to show, and nothing is written under Radix's `aria-hidden`.
 */
export function usePageHidden(): boolean {
  return useSyncExternalStore(
    (watcher) => {
      watchers.add(watcher);
      return () => watchers.delete(watcher);
    },
    () => sheets > 0,
    () => false,
  );
}

/** Runs `then` once no sheet hides the page, at once if none does. Returns what withdraws it while it waits. */
export function whenPageShown(then: () => void): () => void {
  if (sheets === 0) then();
  else waiting = then;
  return () => {
    if (waiting === then) waiting = null;
  };
}

/** Whether a message waits for the page to show: one at a time, not seen yet, and nothing replaces it. */
export const messageWaits = () => waiting !== null;

/** What an action sent from a sheet is given to say its failure, in the sheet or in the bar. */
export interface FromSheet {
  /** Whether a failure is said in the sheet: it is open, and it is the one that sent. */
  inSheet: () => boolean;
  /** Runs `then` once no sheet hides the page (`whenPageShown`); withdrawn if the sheet sends again. */
  whenClosed: (then: () => void) => void;
}
