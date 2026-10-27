import { describe, expect, it, vi } from "vitest";
import { createSheetHistory, MARK, type HistoryWindow } from "./sheet-history";

// event-board v4.7: the back gesture closes the open sheet, or leaves its step (#656, #768).

type State = Record<string, unknown>;

/**
 * A tab's history, as the page sees it: its entries, and a `popstate` in a later task once a
 * traversal is done, which Next hears after us unless it is stopped. Each entry has its own
 * scroll restoration mode, which `pushState` copies.
 */
function fakeTab() {
  const entries: { state: State; mode: ScrollRestoration; href: string }[] = [{ state: { __NA: true }, mode: "auto", href: "/e/1" }];
  let index = 0;
  let listener: (event: Pick<Event, "stopImmediatePropagation">) => void = () => {};
  const calls = { pushState: [] as unknown[][], go: [] as number[] };
  // The mode of the entry each popstate lands on: the browser restores the scroll by it.
  const landed: ScrollRestoration[] = [];
  let heardByNext = 0;
  const traverse = (by: number) =>
    setTimeout(() => {
      index = Math.max(0, Math.min(entries.length - 1, index + by));
      location.href = entries[index].href;
      let stopped = false;
      listener({ stopImmediatePropagation: () => void (stopped = true) });
      if (!stopped) heardByNext += 1;
      landed.push(entries[index].mode);
    });
  const history = {
    get state() {
      return entries[index].state;
    },
    get scrollRestoration() {
      return entries[index].mode;
    },
    set scrollRestoration(mode: ScrollRestoration) {
      entries[index].mode = mode;
    },
    pushState(...args: unknown[]) {
      calls.pushState.push(args);
      // As Next's: its own state copied into the new entry, at the address given, if any.
      const [state, , href = entries[index].href] = args as [State, string, string?];
      entries.splice(++index, entries.length, { state: { __NA: true, ...state }, mode: entries[index - 1].mode, href: (location.href = href) });
    },
    go: (by: number) => (calls.go.push(by), traverse(by)),
  };
  const location = { href: "/e/1" };
  const win: HistoryWindow = { history, location, addEventListener: (_type, added) => void (listener = added) };
  const sheets = createSheetHistory(win);
  const at = () => ({ index, length: entries.length, heardByNext });
  return { sheets, win, calls, landed, traverse, at, state: () => entries[index].state };
}

/** Lets the microtasks, the traversals and the tasks they queue run, one task after the other. */
async function settle() {
  for (let task = 0; task < 10; task += 1) await new Promise((resolve) => setTimeout(resolve));
}

describe("createSheetHistory", () => {
  it("an opening adds one entry, its mark only, the address left as it is (rules 6 and 8)", async () => {
    const tab = fakeTab();
    tab.sheets.add(() => {});
    await settle();
    // Two arguments: no URL, so neither the address nor its fragment changes.
    expect(tab.calls.pushState).toEqual([[{ [MARK]: expect.any(String) }, ""]]);
    expect(Object.keys(tab.state())).toEqual(["__NA", MARK]);
  });

  it("the person going back calls `onBack`, the top entry's first, and the history is not moved again (rule 4)", async () => {
    const tab = fakeTab();
    const called: string[] = [];
    const sheet = tab.sheets.add(() => called.push("sheet"));
    await settle();
    tab.sheets.add(() => called.push("step"));
    await settle();
    tab.traverse(-1);
    await settle();
    expect(called).toEqual(["step"]);
    tab.traverse(-1);
    await settle();
    expect(called).toEqual(["step", "sheet"]);
    // Next would restore the same page, and drop the answer of a server action on its way.
    expect(tab.at().heardByNext).toBe(0);
    tab.sheets.remove(sheet);
    await settle();
    expect(tab.calls.go).toEqual([]);
  });

  it("an entry that is no longer the active one is left alone", async () => {
    const tab = fakeTab();
    const entry = tab.sheets.add(() => {});
    await settle();
    // A navigation of Next's writes its own state over the entry's.
    delete tab.state()[MARK];
    tab.sheets.remove(entry);
    await settle();
    expect(tab.calls.go).toEqual([]);
  });

  it("closed otherwise, with one step back that calls no `onBack`: the step its own entry, the sheet closed from it both (rules 3 bis, 5)", async () => {
    const tab = fakeTab();
    const onSheetBack = vi.fn();
    const sheet = tab.sheets.add(onSheetBack);
    await settle();
    const step = tab.sheets.add(() => {});
    await settle();
    tab.sheets.remove(step);
    await settle();
    expect(tab.calls.go).toEqual([-1]);
    tab.sheets.add(() => {});
    await settle();
    tab.sheets.remove(sheet);
    await settle();
    expect(tab.calls.go).toEqual([-1, -2]);
    expect(tab.at()).toMatchObject({ index: 0, heardByNext: 0 });
    expect(onSheetBack).not.toHaveBeenCalled();
  });

  it("a step to or from another address is Next's, a sheet left open there or an entry of a closed one", async () => {
    const tab = fakeTab();
    const onBack = vi.fn();
    // A link from /e/1 to /e/2, a sheet opened there, then back two steps, to /e/1: the sheet closes, and Next shows /e/1.
    tab.win.history.pushState({}, "", "/e/2");
    tab.sheets.add(onBack);
    await settle();
    tab.traverse(-2);
    await settle();
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(tab.at().heardByNext).toBe(1);
    // « Suivant » twice, onto the closed sheet's entry, a link from there, then back onto it: each Next's.
    tab.traverse(1);
    await settle();
    tab.traverse(1);
    await settle();
    tab.win.history.pushState({}, "", "/");
    tab.traverse(-1);
    await settle();
    expect(tab.at().heardByNext).toBe(4);
  });

  it("the browser restores no scroll as an entry leaves, then the page's mode is as it was (G1.10)", async () => {
    const tab = fakeTab();
    const entry = tab.sheets.add(() => {});
    await settle();
    tab.sheets.remove(entry);
    await settle();
    expect(tab.win.history.scrollRestoration).toBe("auto");
    tab.sheets.add(() => {});
    await settle();
    tab.traverse(-1);
    await settle();
    expect(tab.landed).toEqual(["manual", "manual"]);
    expect(tab.win.history.scrollRestoration).toBe("auto");
  });
});
