import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { focusTitle } from "./focus-title";

/** A page reduced to what `focusTitle` reads: no DOM library, the node environment, a title that can come and go. */
class FakeElement {
  isConnected = true;
  constructor(private readonly page: FakePage) {}
  focus() {
    this.page.activeElement = this;
  }
}
class FakePage {
  body = new FakeElement(this);
  activeElement: FakeElement = this.body;
  title: FakeElement | undefined;
  observed = false;
  mutated: (() => void) | undefined;

  /** The page shows a title (the first, or the one that replaces it); the previous one leaves, and the focus with it. */
  showTitle() {
    if (this.title) this.title.isConnected = false;
    if (this.activeElement === this.title) this.activeElement = this.body;
    this.title = new FakeElement(this);
    if (this.observed) this.mutated?.();
    return this.title;
  }
}

let page: FakePage;
beforeEach(() => {
  vi.useFakeTimers();
  page = new FakePage();
  vi.stubGlobal("document", {
    body: page.body,
    get activeElement() {
      return page.activeElement;
    },
    querySelector: () => page.title ?? null,
  });
  vi.stubGlobal(
    "MutationObserver",
    class {
      constructor(callback: () => void) {
        page.mutated = callback;
      }
      observe() {
        page.observed = true;
      }
      disconnect() {
        page.observed = false;
      }
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("focusTitle (OA5.2, « Le focus »)", () => {
  it("waits for a title that is not there yet, and focuses it when it shows", () => {
    focusTitle();
    expect(page.activeElement).toBe(page.body);
    const title = page.showTitle();
    expect(page.activeElement).toBe(title);
  });

  it("hands the focus to the title that replaces the one that had it, when the focus fell back on the body", () => {
    focusTitle();
    page.showTitle();
    const next = page.showTitle();
    expect(page.activeElement).toBe(next);
    expect(page.observed).toBe(true);
  });

  it("once the focus has moved away on purpose, leaves it, and stops watching", () => {
    focusTitle();
    page.showTitle();
    new FakeElement(page).focus();
    page.mutated?.();
    expect(page.observed).toBe(false);
    // The focus falls back on the body, then another title shows: it is no longer taken.
    page.activeElement = page.body;
    const next = page.showTitle();
    expect(page.activeElement).not.toBe(next);
    expect(page.activeElement).toBe(page.body);
  });

  it("gives up after the wait", () => {
    focusTitle();
    vi.advanceTimersByTime(5_000);
    expect(page.observed).toBe(false);
  });
});
