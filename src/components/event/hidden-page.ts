import { useEffect, useId, useRef, useSyncExternalStore } from "react";

/*
 * Whether a sheet hides the rest of the page (#193, #195). Radix hides it from screen readers
 * from the mount of a sheet's content to its unmount, its closing animation included, and the
 * message bar is under the sheet: a message written there meanwhile is neither seen nor heard.
 */
let sheets = 0;
/** What waits for the page to show, in the order it came: each entry is its own (#167). */
const waiting = new Set<{ then: () => void }>();
const watchers = new Set<() => void>();
const changed = () => watchers.forEach((watcher) => watcher());

/** Counts a sheet as hiding the page until the function it returns is called: its unmount. */
export function coverPage(): () => void {
  sheets += 1;
  changed();
  return () => {
    sheets -= 1;
    // Once the commit is over: a sheet that took this one's place in it hides the page still.
    queueMicrotask(() => {
      if (sheets > 0) return;
      changed();
      const due = [...waiting];
      waiting.clear();
      for (const entry of due) entry.then();
    });
  };
}

/** In the content of every sheet (`BottomSheet`): the page is hidden while it is mounted. */
export function HidesPage() {
  useEffect(coverPage, []);
  return null;
}

/**
 * Whether a sheet hides the page now, for a live region outside the bar (#182): what it says
 * waits for the page to show, and nothing is written under Radix's `aria-hidden`. Its next
 * words replace the last, where `whenPageShown` keeps every message for the bar.
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

/**
 * Runs `then` once no sheet hides the page, at once if none does. Every message that waits is
 * kept, and runs in turn. Returns what withdraws this one alone while it waits.
 */
export function whenPageShown(then: () => void): () => void {
  if (sheets === 0) {
    then();
    return () => {};
  }
  const entry = { then };
  waiting.add(entry);
  return () => void waiting.delete(entry);
}

/** What an action sent from a sheet is given to say its failure, in the sheet or in the bar. */
export interface FromSheet {
  /**
   * The sheet that sends, one per mount: the page's actions run once per sheet (`runAction`),
   * so that one on its way never drops the action of a sheet opened since (#167).
   */
  key: string;
  /** Whether a failure is said in the sheet: it is open, and it is the one that sent. */
  inSheet: () => boolean;
  /** Its answer came: withdraws what an earlier send it covers left for the bar. */
  answered: () => void;
  /** Runs `then` once no sheet hides the page (`whenPageShown`); withdrawn by the next send or answer that covers it. */
  whenClosed: (then: () => void) => void;
}

/** The failures waiting for the bar, each with what its send was about (#208). */
const left = new Set<{ about: readonly string[]; withdraw: () => void }>();

/** Withdraws each waiting failure a send about `about` covers: all it was about. */
function withdraw(about: readonly string[]) {
  for (const entry of left) {
    if (!entry.about.every((subject) => about.includes(subject))) continue;
    entry.withdraw();
    left.delete(entry);
  }
}

/**
 * For the content of a sheet that sends actions, under `SheetContent`: call what it returns at
 * each send, for that send's `FromSheet`. Each mount is a sheet of its own (`useId` draws a new
 * id at each mount once the page is hydrated): one reopened once closed is a new one, and the
 * sheet that sent is gone. Above the content, `key` would outlive the sheet's openings.
 *
 * A failure is about its `subject` (a person, a cell; the sheet itself by default), whichever
 * sheet sent it, and about the `fields` its send carried, if given. A send, or an answer, that
 * covers all of that withdraws the message an earlier send left waiting for the bar: the page,
 * or the sheet, says what comes of the new one. A send of the number alone does not withdraw a
 * failed first name (#208).
 */
export function useSends(isOpen: () => boolean, subject?: string): (fields?: readonly string[]) => FromSheet {
  const key = useId();
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  return (fields = []) => {
    const about = [subject ?? key, ...fields.map((field) => `${subject ?? key}:${field}`)];
    withdraw(about);
    return {
      key,
      inSheet: () => isOpen() && mounted.current,
      answered: () => withdraw(about),
      whenClosed: (then) => {
        const entry = { about, withdraw: () => {} };
        left.add(entry);
        entry.withdraw = whenPageShown(() => {
          left.delete(entry);
          then();
        });
      },
    };
  };
}
