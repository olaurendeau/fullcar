import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAnnouncer } from "./announce";
import { coverPage } from "./hidden-page";

// « Lecteurs d’écran », point 3 (docs/design/event-board/README.md, v4.2.2): empty at once, the text 100 ms later.

/** A region: what it holds, and every write it was given. */
function region() {
  const writes: string[] = [];
  return { writes, write: (text: string) => void writes.push(text), holds: () => writes.at(-1) ?? "" };
}

describe("createAnnouncer", () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it("empties the region at once, then writes the text 100 ms later", () => {
    const alert = region();
    createAnnouncer(alert.write).say("Tom n’a pas pu monter.");
    expect(alert.writes).toEqual([""]);
    vi.advanceTimersByTime(99);
    expect(alert.holds()).toBe("");
    vi.advanceTimersByTime(1);
    expect(alert.writes).toEqual(["", "Tom n’a pas pu monter."]);
  });

  it("the same text again: the region empties, then holds it once more, with no comparison of texts", () => {
    const alert = region();
    const announcer = createAnnouncer(alert.write);
    announcer.say("Hors ligne.");
    vi.advanceTimersByTime(100);
    announcer.say("Hors ligne.");
    expect(alert.holds()).toBe("");
    vi.advanceTimersByTime(100);
    expect(alert.writes).toEqual(["", "Hors ligne.", "", "Hors ligne."]);
  });

  it("a later text cancels the one waiting: only the second is written", () => {
    const alert = region();
    const announcer = createAnnouncer(alert.write);
    announcer.say("A");
    announcer.say("B");
    vi.advanceTimersByTime(1_000);
    expect(alert.writes.filter(Boolean)).toEqual(["B"]);
  });

  it("emptied before 100 ms (its line gone, « Fermer »): the region stays empty", () => {
    const alert = region();
    const announcer = createAnnouncer(alert.write);
    announcer.say("A");
    announcer.clear();
    vi.advanceTimersByTime(1_000);
    expect(alert.writes.filter(Boolean)).toEqual([]);
  });

  it("a sheet that hides the page by then: the text waits for it to close, and nothing is written under it", async () => {
    const alert = region();
    const announcer = createAnnouncer(alert.write);
    announcer.say("A");
    const uncover = coverPage();
    vi.advanceTimersByTime(100);
    expect(alert.holds()).toBe("");
    uncover();
    await vi.advanceTimersByTimeAsync(0);
    expect(alert.holds()).toBe("A");

    // Emptied while it waits: nothing is written once the sheet closes.
    announcer.say("B");
    const again = coverPage();
    vi.advanceTimersByTime(100);
    announcer.clear();
    again();
    await vi.advanceTimersByTimeAsync(0);
    expect(alert.writes.filter(Boolean)).toEqual(["A"]);
  });
});
