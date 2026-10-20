import { useEffect, type RefObject } from "react";

/*
 * The board does not move on screen when the panel above it changes height (O1.11, README
 * « Le tableau ne bouge pas »): Safari iOS has no scroll anchoring, and /admin turns it off
 * everywhere else, so that this is the only compensation.
 */

/**
 * How far to scroll once the panel, whose top is at `top` on screen, went from `before` to
 * `after` px high: by as much, when its bottom was above the top of the screen, the
 * organiser looking at the board; otherwise nothing, the change being where they look.
 */
export function compensation({ top, before, after }: { top: number; before: number; after: number }): number {
  return top + before < 0 ? after - before : 0;
}

/**
 * Watches the panel's frame, `ref`, and scrolls the page by its change of height when
 * `compensation` says so: after layout and before paint, in the same frame, so that nothing
 * jumps on screen. Whatever changed it, sections withdrawn or rendered, lists, alert, tiles.
 */
export function useKeepBoardInPlace(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let height = frame.getBoundingClientRect().height;
    const observer = new ResizeObserver(() => {
      const { top, height: after } = frame.getBoundingClientRect();
      const delta = compensation({ top, before: height, after });
      height = after;
      if (delta !== 0) window.scrollBy({ top: delta, behavior: "instant" });
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [ref]);
}
