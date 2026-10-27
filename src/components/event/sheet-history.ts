/*
 * The entries an open sheet adds to the tab's history, so that the browser's « back » closes it, or
 * leaves its step, instead of leaving the page (event-board v4.7, #656): one per sheet open, one more
 * per step or confirmation open over it (rule 3 bis), each taken away as what added it closes.
 */

/** The one key the page adds to `history.state`; its value says which opening, nothing of a person (rule 8). */
export const MARK = "fullcarSheet";

/** What a sheet needs of `window`. */
export interface HistoryWindow {
  history: Pick<History, "state" | "pushState" | "go" | "scrollRestoration">;
  location: Pick<Location, "href">;
  addEventListener(type: "popstate", listener: (event: Pick<Event, "stopImmediatePropagation">) => void): void;
}

interface Entry {
  readonly id: string;
  onBack: () => void;
  pushed: boolean;
  leaving: boolean;
}

const markOf = (state: unknown) => (state !== null && typeof state === "object" ? (state as Record<string, unknown>)[MARK] : undefined);

/**
 * An entry is added by Next's `history.pushState(state, "")`: no address, so neither it nor its
 * fragment changes, and Next's state is copied into it (rules 6, 7). Next never hears of a step
 * between them at the same address: it would drop the answer of a server action on its way
 * (`discarded`). Taken away while still the active one, an entry leaves by `history.go`, and the
 * next is added once that is over, lest it take the new one away (G1.9). Meanwhile, the browser
 * restores no scroll: it would undo what the sheet's action scrolled, « Trouver une place » (rule 5).
 */
export function createSheetHistory(win: HistoryWindow) {
  // Unique to this page load: an entry left from before a reload is never taken for one of these.
  const load = Math.random().toString(36).slice(2, 10);
  let count = 0;
  const stack: Entry[] = [];
  let travelling = false;
  let scheduled = false;
  // The page's address as its entries were added: they all have it.
  let address = "";
  // The page's scroll restoration, while its entries hold it at `manual`.
  let restored: ScrollRestoration | null = null;

  const pushed = () => stack.filter((entry) => entry.pushed);

  /** Once the page is back on its own entry, its scroll restoration as it was, after the browser's. */
  function landed() {
    if (pushed().length > 0 || restored === null) return;
    setTimeout(() => {
      if (pushed().length > 0 || restored === null) return;
      win.history.scrollRestoration = restored;
      restored = null;
    });
  }

  function settle() {
    scheduled = false;
    if (travelling) return;
    const leaving = stack.filter((entry) => entry.leaving);
    if (leaving.length > 0) {
      const gone = leaving.filter((entry) => entry.pushed);
      for (const entry of leaving) stack.splice(stack.indexOf(entry), 1);
      // The entries above the others: taken away, they leave the history if they are still its own.
      if (gone.length > 0 && markOf(win.history.state) === gone[gone.length - 1].id) {
        travelling = true;
        win.history.go(-gone.length);
        return;
      }
      landed();
    }
    for (const entry of stack) {
      if (entry.pushed) continue;
      if (pushed().length === 0) {
        address = win.location.href;
        restored ??= win.history.scrollRestoration;
        win.history.scrollRestoration = "manual";
      }
      win.history.pushState({ [MARK]: entry.id }, "");
      entry.pushed = true;
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(settle);
  }

  function onPopState(event: Pick<Event, "stopImmediatePropagation">) {
    // Only a step between this page's entries, at their address: any other is Next's, onto a closed sheet's entry too.
    if ((travelling || pushed().length > 0) && win.location.href === address) event.stopImmediatePropagation();
    if (travelling) {
      travelling = false;
      landed();
      settle();
      return;
    }
    // Back on one of the entries, or below them all: those above it are left, the top one first.
    const mark = markOf(win.history.state);
    const on = stack.findIndex((entry) => entry.pushed && entry.id === mark);
    const left = stack.filter((entry, at) => entry.pushed && at > on).reverse();
    for (const entry of left) stack.splice(stack.indexOf(entry), 1);
    for (const entry of left) entry.onBack();
    landed();
  }

  win.addEventListener("popstate", onPopState);
  return {
    /** Adds an entry above the others; going back from it calls `onBack`. */
    add(onBack: () => void): { readonly id: string } {
      count += 1;
      const entry: Entry = { id: `${load}.${count}`, onBack, pushed: false, leaving: false };
      stack.push(entry);
      schedule();
      return entry;
    },
    /** Takes this entry away, and those above it in the history, with a step back if they are still the active ones. */
    remove(taken: { readonly id: string }) {
      const at = stack.findIndex((entry) => entry.id === taken.id);
      if (at === -1) return;
      // One added since, not yet in the history, is another opening's: its own `remove` takes it.
      for (const entry of stack.slice(at)) if (entry === stack[at] || entry.pushed) entry.leaving = true;
      schedule();
    },
  };
}

let shared: ReturnType<typeof createSheetHistory> | undefined;

/**
 * The page's: every sheet's entries in one stack, as they are in the tab's history. Made first by
 * `instrumentation-client.ts`, before the page hydrates: its `popstate` listener comes before
 * Next's, which listeners on `window` follow in the order they were added, capturing or not.
 */
export function sheetHistory() {
  return (shared ??= createSheetHistory(window));
}
