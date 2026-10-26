import type { Locator, Page } from "@playwright/test";
import { expect } from "./fixtures";

/*
 * event-board v4.6: where a sheet stands, and what its fixed parts leave of its body. Playwright
 * has neither iOS's WebKit nor a virtual keyboard: an iPhone's keyboard is simulated by a
 * `window.visualViewport` of our own (K1.7), which the page reads as it would Safari's.
 */

/** The values a test gives the fake `visualViewport`; those it leaves out follow the window. */
export interface VisibleArea {
  height?: number;
  offsetTop?: number;
}

/**
 * Replaces `window.visualViewport`, before any script of the page runs, with an object of ours:
 * `width`, `height`, `offsetTop`, `pageTop`, `scale` 1, and its `resize` and `scroll` events.
 * Until `moveVisibleArea` sets them, its height and width are the window's.
 */
export async function fakeVisualViewport(page: Page) {
  await page.addInitScript(() => {
    const set: { height?: number; offsetTop?: number } = {};
    const area = new EventTarget();
    const read = (name: string, value: () => number) => Object.defineProperty(area, name, { get: value });
    read("width", () => window.innerWidth);
    read("height", () => set.height ?? window.innerHeight);
    read("offsetTop", () => set.offsetTop ?? 0);
    read("offsetLeft", () => 0);
    read("pageTop", () => window.scrollY + (set.offsetTop ?? 0));
    read("pageLeft", () => window.scrollX);
    read("scale", () => 1);
    Object.defineProperty(window, "visualViewport", { configurable: true, get: () => area });
    Object.defineProperty(window, "moveVisibleArea", {
      value: (next: { height?: number; offsetTop?: number }, type: "resize" | "scroll") => {
        Object.assign(set, next);
        area.dispatchEvent(new Event(type));
      },
    });
  });
}

/** What Safari does as its keyboard opens (`resize`) or as it moves what it shows (`scroll`). */
export async function moveVisibleArea(page: Page, area: VisibleArea, type: "resize" | "scroll") {
  await page.evaluate(
    ([next, event]) => (window as unknown as { moveVisibleArea: (area: object, type: string) => void }).moveVisibleArea(next, event),
    [area, type] as const,
  );
}

/** A box as `getBoundingClientRect` gives it. */
export interface Edges {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** The edges of `locator`'s box, in the window. */
export const edgesOf = (locator: Locator): Promise<Edges> =>
  locator.evaluate((element) => {
    const { top, bottom, left, right } = element.getBoundingClientRect();
    return { top, bottom, left, right };
  });

/** `[x, y, width, height]` of `locator`'s box, rounded: what K1 compares at 1 px. */
export async function boxOf(locator: Locator) {
  const { left, top, right, bottom } = await edgesOf(locator);
  return [left, top, right - left, bottom - top].map(Math.round);
}

/** The sheet's fixed parts: its header and its bar. */
export const headerOf = (sheet: Locator) => sheet.locator('[data-slot="sheet-header"]');
export const barOf = (sheet: Locator) => sheet.locator('[data-slot="sheet-footer"]');

/** The space a body element must keep from the header and the bar (rule 5). */
export const MARGIN = 8;

/**
 * Rule 5, K1.16: `element` is entirely in the window, and either in the bar, or entirely
 * between the bottom of the header and the top of the bar, `MARGIN` px from both.
 */
export async function expectClearOfFixedParts(sheet: Locator, element: Locator) {
  await expect(element).toBeInViewport({ ratio: 1 });
  const inBar = await element.evaluate((node) => !!node.closest('[data-slot="sheet-footer"]'));
  if (inBar) return;
  const [box, header, bar] = await Promise.all([edgesOf(element), edgesOf(headerOf(sheet)), edgesOf(barOf(sheet))]);
  const name = await element.evaluate((node) => node.textContent?.trim() || node.getAttribute("aria-label") || node.id);
  expect(box.top - header.bottom, `${name}: from the header`).toBeGreaterThanOrEqual(MARGIN - 0.5);
  expect(bar.top - box.bottom, `${name}: from the bar`).toBeGreaterThanOrEqual(MARGIN - 0.5);
}
