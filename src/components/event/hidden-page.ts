import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { covers, type Sent, type Withdrawal } from "./bar-state";

/*
 * Whether a sheet hides the rest of the page (#193, #195). Radix hides it from screen readers
 * from the mount of a sheet's content to its unmount, its closing animation included, and the
 * message bar is under the sheet: a message written there meanwhile is neither seen nor heard.
 */
let sheets = 0;
/** What waits for the page to show, in the order it came (#167). */
const waiting = new Set<() => void>();
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
      for (const then of due) then();
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

/** Runs `then` once no sheet hides the page, at once if none does, each in turn. Returns what withdraws it alone while it waits. */
export function whenPageShown(then: () => void): () => void {
  if (sheets === 0) then();
  else waiting.add(then);
  return () => void waiting.delete(then);
}

/** A send to the server (#208, #216): what it is about, its number, and what it is given to say what came of it. */
export interface Send {
  about: readonly string[];
  seq: number;
  /** Its answer came: withdraws what earlier sends it covers left, never what a send made since did. */
  answered: () => void;
  /** Runs `then` once no sheet hides the page (`whenPageShown`); withdrawn meanwhile by a send that covers it, or with its car. */
  whenClosed: (then: () => void) => void;
}

/** What an action sent from a sheet is given to say its failure, in the sheet or in the bar. */
export interface FromSheet extends Send {
  /**
   * The sheet that sends, one per mount: the page's actions run once per sheet (`runAction`),
   * so that one on its way never drops the action of a sheet opened since (#167).
   */
  key: string;
  /** Whether a failure is said in the sheet: it is open, and it is the one that sent. */
  inSheet: () => boolean;
}

let sends = 0;
/** What waits for the bar, each with what its send was about (#208). */
const left = new Set<Sent & { withdraw: () => void }>();
/** The subjects of a car removed, and the first send made since: what an earlier one says, nothing says. */
const gone = new Map<string, number>();
/** The bar, which withdraws the failures it shows. */
const watching = new Set<(withdrawal: Withdrawal) => void>();

/** Calls `then` at each withdrawal, until the function it returns is called. */
export function onWithdraw(then: (withdrawal: Withdrawal) => void): () => void {
  watching.add(then);
  return () => void watching.delete(then);
}

function withdraw(withdrawal: Withdrawal) {
  if ("gone" in withdrawal) for (const subject of withdrawal.gone) gone.set(subject, withdrawal.before);
  for (const entry of left) {
    if (!covers(withdrawal, entry)) continue;
    entry.withdraw();
    left.delete(entry);
  }
  for (const then of watching) then(withdrawal);
}

/**
 * A send about `about`, its subject then each of its fields (`subject:field`). It withdraws at
 * once what it covers, waiting or in the bar (rule 5): the page, or the sheet, says what comes of
 * this one. A send of the number alone does not withdraw a failed first name (#208).
 */
export function sendAbout(about: readonly string[]): Send {
  const seq = (sends += 1);
  withdraw({ about });
  return {
    about,
    seq,
    answered: () => withdraw({ about, before: seq }),
    whenClosed: (then) => {
      if ((gone.get(about[0]) ?? 0) > seq) return;
      const entry = { about, sent: seq, withdraw: () => {} };
      left.add(entry);
      entry.withdraw = whenPageShown(() => {
        left.delete(entry);
        then();
      });
    },
  };
}

/**
 * The subjects of a car just removed: everything sent about them until now, waiting, in the bar
 * or still on its way, is withdrawn and never said (#213, #218). The car no longer exists.
 */
export function forget(subjects: readonly string[]) {
  withdraw({ gone: subjects, before: sends + 1 });
}

/**
 * For the content of a sheet that sends actions, under `SheetContent`: call what it returns at
 * each send, for that send's `FromSheet`. Each mount is a sheet of its own (`useId` draws a new
 * id at each mount once the page is hydrated): one reopened once closed is a new one, and the
 * sheet that sent is gone. Above the content, `key` would outlive the sheet's openings.
 *
 * A send is about its `subject` (a person, a cell, a car; the sheet itself by default),
 * whichever sheet sent it, and about the `fields` it carried, if given (`sendAbout`).
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
    const about = subject ?? key;
    return { key, inSheet: () => isOpen() && mounted.current, ...sendAbout([about, ...fields.map((field) => `${about}:${field}`)]) };
  };
}
