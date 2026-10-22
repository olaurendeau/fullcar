import { whenPageShown } from "./hidden-page";

/**
 * How the bar writes in one of its live regions (« Lecteurs d’écran », point 3, v4.2.2): the
 * region is emptied at once, and the text written `delay` ms later, so that the DOM changes even
 * for the same text, with no comparison of texts. A later write, or emptying the region, cancels
 * the one waiting. A sheet that hides the page by then delays the text until it closes: nothing
 * is written under Radix's `aria-hidden`.
 */
export interface Announcer {
  say: (text: string) => void;
  clear: () => void;
  /**
   * The text said is now `text`, which is no new text to say (event-board v4.4.6, #372): one
   * already written is emptied, and nothing is written after; one waiting to be written, for
   * its delay or for a sheet to close, is written as `text`, when it would have been.
   */
  amend: (text: string) => void;
}

export function createAnnouncer(write: (text: string) => void, delay = 100): Announcer {
  let cancel = () => {};
  /** The text waiting to be written, until it is. */
  let due: string | null = null;
  function clear() {
    cancel();
    due = null;
    write("");
  }
  return {
    clear,
    say(text) {
      clear();
      due = text;
      const timer = setTimeout(() => {
        cancel = whenPageShown(() => {
          const written = due ?? "";
          due = null;
          write(written);
        });
      }, delay);
      cancel = () => clearTimeout(timer);
    },
    amend(text) {
      if (due === null) clear();
      else due = text;
    },
  };
}
