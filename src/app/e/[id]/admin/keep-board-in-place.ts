import { useEffect, type RefObject } from "react";

/*
 * The board does not move on screen when the panel above it changes height (O1.11, README
 * « Le tableau ne bouge pas »): Safari iOS has no scroll anchoring, and /admin turns it off
 * everywhere else, so that this is the only compensation.
 */

/**
 * How far to scroll once the panel, whose top was at `top` on screen, went from `before` to
 * `after` px high: by as much, when its bottom was above the top of the screen, the
 * organiser looking at the board; otherwise nothing, the change being where they look. Less
 * what the browser already scrolled meanwhile, `clamped`: near the bottom of a page that gets
 * shorter, it pulls the scroll back itself.
 */
export function compensation({
  top,
  before,
  after,
  clamped = 0,
}: {
  top: number;
  before: number;
  after: number;
  clamped?: number;
}): number {
  return top + before < 0 ? after - before - clamped : 0;
}

/**
 * Watches the panel's frame, `ref`, and scrolls the page by its change of height when
 * `compensation` says so: after layout and before paint, in the same frame, so that nothing
 * jumps on screen. Whatever changed it, sections withdrawn or rendered, lists, alert, tiles.
 * The browser's clamp only pulls the scroll back, to the end of a page that got shorter, and
 * the organiser may scroll in that same frame (#297): so the scroll before the change is the
 * last one seen while the frame had the height this observer knew, the clamp is how far that
 * scroll is past the end of the page now, and whatever else moved meanwhile is the organiser's
 * own, kept as it is.
 */
export function useKeepBoardInPlace(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let height = frame.getBoundingClientRect().height;
    let scrolled = window.scrollY;
    const onScroll = () => {
      if (frame.getBoundingClientRect().height === height) scrolled = window.scrollY;
    };
    const observer = new ResizeObserver(() => {
      const { top, height: after } = frame.getBoundingClientRect();
      // The end of the page is at least where the scroll is, whatever a scrollbar takes.
      const end = Math.max(window.scrollY, document.documentElement.scrollHeight - window.innerHeight);
      const clamped = after < height ? Math.min(0, end - scrolled) : 0;
      const delta = compensation({ top: top + window.scrollY - scrolled, before: height, after, clamped });
      height = after;
      if (delta !== 0) window.scrollBy({ top: delta, behavior: "instant" });
      scrolled = window.scrollY;
    });
    window.addEventListener("scroll", onScroll, { passive: true });
    observer.observe(frame);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [ref]);
}
