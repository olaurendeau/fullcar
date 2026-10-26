/**
 * Where a sheet stands (event-board v4.6), in pure geometry: what it is given is all it reads.
 *
 * The visible height (rule 4) is the area the person really sees, between the top of the window
 * and the top of the keyboard: `window.visualViewport` (`offsetTop`, `height`), or the window's
 * height without it. On an iPhone, the keyboard does not shrink the window, only that area.
 */

/** Under this visible height, header and bar scroll with the body (rule 8). */
export const LOW_HEIGHT = 240;

/** From this width, a sheet is 448 px wide, centred, at its content's height (rule 9). */
export const WIDE_WIDTH = 640;

/** What an element that takes the focus keeps from the header and the bar, px (rule 5). */
export const MARGIN = 8;

/** A bottom gap under this is rounding, not a keyboard. */
const KEYBOARD_GAP = 1;

export interface SheetFrameInput {
  /** `window.visualViewport`'s `offsetTop` and `height`, when the browser has it. */
  viewport: { offsetTop: number; height: number } | null;
  /** `window.innerHeight`: the layout viewport, that a fixed element is placed in. */
  innerHeight: number;
  /** `window.innerWidth`, as a media query reads it. */
  width: number;
  /** The sheet carries a field, or a form's step (rule 2). */
  fullHeight: boolean;
}

export interface SheetFrame {
  /** From the top of the window, px: where the visible area starts. The sheet's top when it fills it. */
  top: number;
  /** The visible height, px: the sheet's height when it fills it, its most otherwise. */
  height: number;
  /** From the bottom of the window, px: where the visible area ends, the sheet's bottom. */
  bottom: number;
  /** The visible area stops above the window's bottom: a keyboard, and no safe area under the bar (rule 4). */
  keyboard: boolean;
  /** The sheet fills the visible height, at full width, without corners (rule 2). */
  fill: boolean;
  /** 448 px wide and centred, at its content's height (rule 9). */
  wide: boolean;
  /** Under 240 px of visible height, at any width: header and bar scroll with the body (rule 8). */
  low: boolean;
}

export function sheetFrame({ viewport, innerHeight, width, fullHeight }: SheetFrameInput): SheetFrame {
  const top = Math.max(0, Math.min(viewport?.offsetTop ?? 0, innerHeight));
  const height = Math.max(0, Math.min(viewport?.height ?? innerHeight, innerHeight - top));
  const bottom = innerHeight - top - height;
  const wide = width >= WIDE_WIDTH;
  return {
    top,
    height,
    bottom,
    keyboard: bottom >= KEYBOARD_GAP,
    fill: fullHeight && !wide,
    wide,
    low: height < LOW_HEIGHT,
  };
}

/** A box's top and bottom, from the top of the window, px. */
export interface Span {
  top: number;
  bottom: number;
}

/**
 * How far the sheet scrolls, px, for `box`, what has the focus, to be whole in `space`, what the
 * header and the bar leave of it with their margins (rule 5): 0 when it is, negative upwards.
 * Taller than the space, its top shows.
 */
export function revealBy(box: Span, space: Span): number {
  if (box.top < space.top) return box.top - space.top;
  if (box.bottom > space.bottom) return Math.min(box.bottom - space.bottom, box.top - space.top);
  return 0;
}
