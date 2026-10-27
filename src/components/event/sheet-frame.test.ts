import { describe, expect, it } from "vitest";
import { LOW_HEIGHT, revealBy, sheetFrame } from "./sheet-frame";

// event-board v4.6, rules 2, 4, 8 and 9: where a sheet stands, from what the window shows.

describe("sheetFrame", () => {
  describe("rule 4: the visible height", () => {
    it("without visualViewport, the window's height, from its top", () => {
      expect(sheetFrame({ viewport: null, innerHeight: 640, width: 360, fullHeight: true })).toMatchObject({
        top: 0,
        height: 640,
        bottom: 0,
        keyboard: false,
      });
    });

    it("with it, what it shows: from its top to the keyboard's", () => {
      expect(sheetFrame({ viewport: { offsetTop: 0, height: 340 }, innerHeight: 640, width: 360, fullHeight: true })).toMatchObject({
        top: 0,
        height: 340,
        bottom: 300,
        keyboard: true,
      });
    });

    it("moved by Safari to show a field, the visible area keeps its height from its new top", () => {
      expect(sheetFrame({ viewport: { offsetTop: 120, height: 340 }, innerHeight: 640, width: 360, fullHeight: true })).toMatchObject({
        top: 120,
        height: 340,
        bottom: 180,
        keyboard: true,
      });
    });

    it("the keyboard closed, the whole window again, its safe area counted", () => {
      expect(sheetFrame({ viewport: { offsetTop: 0, height: 640 }, innerHeight: 640, width: 360, fullHeight: true })).toMatchObject({
        top: 0,
        height: 640,
        bottom: 0,
        keyboard: false,
      });
    });

    it("half a pixel of rounding is no keyboard", () => {
      expect(sheetFrame({ viewport: { offsetTop: 0, height: 639.5 }, innerHeight: 640, width: 360, fullHeight: true }).keyboard).toBe(false);
    });

    it("a visible area that would end past the window ends with it", () => {
      expect(sheetFrame({ viewport: { offsetTop: 10, height: 640 }, innerHeight: 640, width: 360, fullHeight: true })).toMatchObject({
        top: 10,
        height: 630,
        bottom: 0,
      });
    });
  });

  describe("rules 2 and 9: who fills it", () => {
    it("on a phone, a sheet with a field fills the visible height", () => {
      expect(sheetFrame({ viewport: null, innerHeight: 640, width: 360, fullHeight: true }).fill).toBe(true);
      expect(sheetFrame({ viewport: null, innerHeight: 640, width: 639, fullHeight: true }).fill).toBe(true);
    });

    it("a sheet of choices keeps its content's height, on a phone too", () => {
      expect(sheetFrame({ viewport: null, innerHeight: 640, width: 360, fullHeight: false })).toMatchObject({ fill: false, wide: false });
    });

    it("from 640 px wide, 448 px wide and centred, at its content's height, even with a field", () => {
      expect(sheetFrame({ viewport: null, innerHeight: 800, width: 640, fullHeight: true })).toMatchObject({ fill: false, wide: true });
      expect(sheetFrame({ viewport: null, innerHeight: 800, width: 1280, fullHeight: true })).toMatchObject({ fill: false, wide: true });
    });
  });

  describe("rule 8: a very low visible area", () => {
    it(`under ${LOW_HEIGHT} px of visible height, header and bar scroll with the body`, () => {
      expect(LOW_HEIGHT).toBe(240);
      expect(sheetFrame({ viewport: null, innerHeight: 230, width: 640, fullHeight: true }).low).toBe(true);
      expect(sheetFrame({ viewport: null, innerHeight: 239, width: 360, fullHeight: true }).low).toBe(true);
      expect(sheetFrame({ viewport: null, innerHeight: 240, width: 360, fullHeight: true }).low).toBe(false);
    });

    it("read on visualViewport's height, never the window's: on an iPhone, the keyboard does not shrink the window", () => {
      expect(sheetFrame({ viewport: { offsetTop: 0, height: 200 }, innerHeight: 360, width: 640, fullHeight: true }).low).toBe(true);
      expect(sheetFrame({ viewport: { offsetTop: 0, height: 270 }, innerHeight: 800, width: 640, fullHeight: true }).low).toBe(false);
    });

    it("at any width", () => {
      for (const width of [360, 640, 1280]) {
        expect(sheetFrame({ viewport: { offsetTop: 0, height: 200 }, innerHeight: 800, width, fullHeight: false }).low).toBe(true);
      }
    });
  });
});

// Rule 5: what has the focus is whole between the header and the bar, after a change of the sheet too.
describe("revealBy", () => {
  const space = { top: 60, bottom: 300 };

  it("whole in the space, the sheet does not scroll", () => {
    expect(revealBy({ top: 60, bottom: 100 }, space)).toBe(0);
    expect(revealBy({ top: 260, bottom: 300 }, space)).toBe(0);
  });

  it("under the space, even in part, it scrolls down until its bottom is the space's", () => {
    expect(revealBy({ top: 280, bottom: 320 }, space)).toBe(20);
    expect(revealBy({ top: 500, bottom: 540 }, space)).toBe(240);
  });

  it("above the space, even in part, it scrolls up until its top is the space's", () => {
    expect(revealBy({ top: 40, bottom: 80 }, space)).toBe(-20);
    expect(revealBy({ top: -200, bottom: -160 }, space)).toBe(-260);
  });

  it("taller than the space, its top shows", () => {
    expect(revealBy({ top: 100, bottom: 500 }, space)).toBe(40);
    expect(revealBy({ top: 20, bottom: 500 }, space)).toBe(-40);
  });
});
