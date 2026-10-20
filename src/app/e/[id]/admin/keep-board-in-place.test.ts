import { describe, expect, it } from "vitest";
import { compensation } from "./keep-board-in-place";

// O1.11: the board stays where it is on screen when the panel above it changes height, and only then.
describe("compensation", () => {
  it.each<[string, { top: number; before: number; after: number }, number]>([
    ["the panel above the screen shrinks: the page scrolls up as much", { top: -1500, before: 1200, after: 400 }, -800],
    ["the panel above the screen grows: the page scrolls down as much", { top: -900, before: 400, after: 1200 }, 800],
    ["the panel's bottom 1 px above the screen", { top: -401, before: 400, after: 100 }, -300],
    ["the panel's bottom at the top of the screen: it is seen, nothing moves", { top: -400, before: 400, after: 100 }, 0],
    ["the panel partly above the screen: it is seen, nothing moves", { top: -200, before: 400, after: 1200 }, 0],
    ["the panel on screen", { top: 16, before: 400, after: 100 }, 0],
    ["the panel below the top of a page scrolled up", { top: 300, before: 1200, after: 1400 }, 0],
    ["the same height", { top: -1500, before: 400, after: 400 }, 0],
  ])("%s", (_, box, delta) => {
    expect(compensation(box)).toBe(delta);
  });
});
