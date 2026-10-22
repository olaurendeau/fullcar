import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { covers, madeUntrue, type Change, type Sent, type Withdrawal } from "./bar-state";

/*
 * Whether a sheet hides the rest of the page (#193, #195). Radix hides it from screen readers
 * from the mount of a sheet's content to its unmount, its closing animation included, and the
 * message bar is under the sheet: a message written there meanwhile is neither seen nor heard.
 */
let sheets = 0;
/** What waits for the page to show, in the order it came (#167): the failures, then the rest (rule 7 of « Lecteurs d’écran »). */
const failures = new Set<() => void>();
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
      const due = [...failures, ...waiting];
      failures.clear();
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

/** Whether a sheet hides the page now, for what is decided once rather than rendered. */
export const pageHidden = () => sheets > 0;

/**
 * Runs `then` once no sheet hides the page, at once if none does, each in turn; a `failure`
 * before the rest, so that it is written first (v4.2.2). Returns what withdraws it alone while it waits.
 */
export function whenPageShown(then: () => void, failure = false): () => void {
  const lane = failure ? failures : waiting;
  if (sheets === 0) then();
  else lane.add(then);
  return () => void lane.delete(then);
}

/** A send to the server (#208, #216): what it is about, its number, and what it is given to say what came of it. */
export interface Send {
  about: readonly string[];
  seq: number;
  /**
   * It goes, and will have an answer: `runAction` says so, never for a run it drops because the
   * same action is on its way. Until then, it covers no failure that comes after it (`whenClosed`).
   */
  leaves: () => void;
  /** Its answer came: withdraws what earlier sends it covers left, never what a send made since did. */
  answered: () => void;
  /**
   * Runs `then` once no sheet hides the page (`whenPageShown`); withdrawn meanwhile by a send
   * that covers it, or with its car. A `failure` that a send made since covers, and that leaves,
   * is never said: that send withdrew it, and its own answer says what came of it (rule 5).
   */
  whenClosed: (then: () => void, failure?: boolean) => void;
  /**
   * Its answer said it succeeded in changing `persons`, each on a leg (`personLeg`): a placement's
   * success from an earlier send, about one of them, is no longer true (rule 2, v4.4.5).
   */
  changed: (persons: readonly string[]) => void;
  /**
   * A placement's success about `persons` on its leg, written as `whenClosed` says unless, by then,
   * a send made since has `changed` one of them: nothing is said instead (v4.4.5-1).
   */
  whenStillTrue: (persons: readonly string[], then: () => void) => void;
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
/** Every send that left (`Send.leaves`), for a failure that comes after a send that covers it. */
const made = new Set<Sent>();
/** What every send that succeeded changed, for a placement's success that comes after (v4.4.5). */
const changes = new Set<Change>();
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
  const sent = { about, sent: seq };
  const whenClosed: Send["whenClosed"] = (then, failure = false) => {
    if ((gone.get(about[0]) ?? 0) > seq) return;
    if (failure && [...made].some((since) => since.sent > seq && covers({ about: since.about }, sent))) return;
    const entry = { about, sent: seq, withdraw: () => {} };
    left.add(entry);
    entry.withdraw = whenPageShown(() => {
      left.delete(entry);
      then();
    }, failure);
  };
  return {
    about,
    seq,
    leaves: () => void made.add(sent),
    answered: () => withdraw({ about, before: seq }),
    whenClosed,
    changed: (persons) => void changes.add({ persons, sent: seq }),
    // Decided as it would be written, once no sheet hides the page: a send answered meanwhile counts.
    whenStillTrue: (persons, then) =>
      whenClosed(() => {
        if (!madeUntrue({ persons, sent: seq }, changes)) then();
      }),
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
 * whichever sheet sent it, and about the `fields` it carried, if given (`sendAbout`). One that
 * names its own `subjects` is about them instead: what it sends, whichever sheet (#228).
 */
export function useSends(
  isOpen: () => boolean,
  subject?: string,
): (fields?: readonly string[], subjects?: readonly string[]) => FromSheet {
  const key = useId();
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  return (fields = [], subjects = [subject ?? key]) => ({ key, inSheet: () => isOpen() && mounted.current, ...sendAbout(aboutOf(subjects, fields)) });
}

/** What a send is about: each of its subjects, then each of that subject's `fields` (`subject:field`), as `sendAbout` reads them. */
export const aboutOf = (subjects: readonly string[], fields: readonly string[] = []): string[] =>
  subjects.flatMap((subject) => [subject, ...fields.map((field) => `${subject}:${field}`)]);

/** Whether an offer's send is about the retour: one of its subjects is the retour's (`offer:retour:…`). */
export const offersRetour = (about: readonly string[]): boolean => about.some((subject) => subject.startsWith("offer:retour:"));

/**
 * What a failure `noRetourAgain` is about: its send's subjects but the retour's offer, which can
 * never be sent again. Its aller sent again alone covers it (event-board v4.4.4, B1.7).
 */
export const allerPart = (about: readonly string[]): string[] => about.filter((subject) => !offersRetour([subject]));
