/** How long the page the link leads to has to show its title before the focus gives up on it. */
const TITLE_WAIT_MS = 5_000;

/**
 * Puts the focus on the title of the page a link has just led to (OA5.2, « Le focus »): the
 * `h1` that takes the focus (`tabindex="-1"`). A page that reads before it shows it (the admin's) is waited
 * for, and so is the title that replaces the first one (the board's, shown while the admin reads, gives way
 * to the refusal's or the notice's): when the title that has the focus leaves the page and the focus fell
 * back on `<body>`, the next one takes it. Once the focus has gone elsewhere on purpose, it is left alone.
 * Returns what stops the wait.
 */
export function focusTitle(): () => void {
  const find = () => document.querySelector<HTMLElement>('main h1[tabindex="-1"]');
  let focused: HTMLElement | undefined;
  const take = () => {
    if (focused?.isConnected) {
      // Still there: if the focus is no longer on it, someone moved it, and the wait is over.
      if (document.activeElement !== focused) stop();
      return;
    }
    const title = find();
    if (!title || (focused && document.activeElement !== document.body)) return;
    focused = title;
    title.focus();
  };
  const observer = new MutationObserver(take);
  const giveUp = setTimeout(() => stop(), TITLE_WAIT_MS);
  function stop() {
    observer.disconnect();
    clearTimeout(giveUp);
  }
  take();
  observer.observe(document.body, { childList: true, subtree: true });
  return stop;
}
