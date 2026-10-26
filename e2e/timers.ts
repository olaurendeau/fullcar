/**
 * How early a timer may end, as `Date.now` measures it: Node's timers keep their own clock, in
 * whole milliseconds, and a delay of 1 500 ms can end at 1 499 ms. A lower bound on a duration
 * allows for it; an upper bound needs nothing.
 */
export const EARLY_MS = 10;
