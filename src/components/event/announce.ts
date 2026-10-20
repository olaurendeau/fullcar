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
}

export function createAnnouncer(write: (text: string) => void, delay = 100): Announcer {
  let cancel = () => {};
  function clear() {
    cancel();
    write("");
  }
  return {
    clear,
    say(text) {
      clear();
      const timer = setTimeout(() => {
        cancel = whenPageShown(() => write(text));
      }, delay);
      cancel = () => clearTimeout(timer);
    },
  };
}
