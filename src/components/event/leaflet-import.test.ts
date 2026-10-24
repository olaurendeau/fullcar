import { afterEach, describe, expect, it, vi } from "vitest";
import { createLeafletImport, type LeafletChange } from "./leaflet-import";

/** A fake module and a fake `import()`: each call is one request, ended by the test. */
function fakeImport() {
  const calls: { resolve: (library: string) => void; reject: () => void }[] = [];
  const load = () =>
    new Promise<string>((resolve, reject) => {
      calls.push({ resolve, reject: () => reject(new Error("chunk")) });
    });
  let online = true;
  const leaflet = createLeafletImport(load, () => online);
  const changes: LeafletChange[] = [];
  const unsubscribe = leaflet.subscribe((change) => changes.push(change));
  /** Ends the last request, then lets its handlers run. */
  const end = async (outcome: "loaded" | "failed") => {
    const call = calls.at(-1)!;
    if (outcome === "loaded") call.resolve("leaflet");
    else call.reject();
    await Promise.resolve();
    await Promise.resolve();
  };
  return { leaflet, calls, changes, end, unsubscribe, setOnline: (value: boolean) => (online = value) };
}

describe("Leaflet's import, one for the page (CA2.10)", () => {
  it("asks for nothing until a map opens", () => {
    const { leaflet, calls } = fakeImport();
    expect(leaflet.snapshot().state.phase).toBe("idle");
    expect(leaflet.snapshot().library).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("two legs opened: one request; loaded, both read the module", async () => {
    const { leaflet, calls, end } = fakeImport();
    leaflet.open();
    leaflet.open();
    expect(calls).toHaveLength(1);
    expect(leaflet.snapshot().state.phase).toBe("loading");
    await end("loaded");
    expect(leaflet.snapshot()).toEqual({ state: { phase: "ready", failures: 0, again: false }, library: "leaflet" });
    leaflet.open();
    expect(calls).toHaveLength(1);
  });

  it("failed: opened again or shown, no request; « Réessayer » from both legs, one request", async () => {
    const { leaflet, calls, end } = fakeImport();
    leaflet.open();
    await end("failed");
    expect(leaflet.snapshot().state).toEqual({ phase: "failed", failures: 1, again: false });
    leaflet.open();
    expect(calls).toHaveLength(1);

    leaflet.retry();
    leaflet.retry();
    expect(calls).toHaveLength(2);
    expect(leaflet.snapshot().state.phase).toBe("loading");
  });

  it("counts the failures in a row for the page, and reads navigator.onLine at each", async () => {
    const { leaflet, end, setOnline } = fakeImport();
    leaflet.open();
    await end("failed");
    leaflet.retry();
    await end("failed");
    expect(leaflet.snapshot().state).toEqual({ phase: "failed", failures: 2, again: true });
    setOnline(false);
    leaflet.retry();
    await end("failed");
    expect(leaflet.snapshot().state).toEqual({ phase: "failed", failures: 3, again: false });
    setOnline(true);
    leaflet.retry();
    await end("loaded");
    expect(leaflet.snapshot().state).toEqual({ phase: "ready", failures: 0, again: false });
  });

  it("tells each change to its listeners, before and after, and nothing when nothing changed", async () => {
    const { leaflet, changes, end } = fakeImport();
    leaflet.retry();
    expect(changes).toEqual([]);
    leaflet.open();
    await end("failed");
    leaflet.retry();
    const idle = { phase: "idle", failures: 0, again: false };
    const loading = { phase: "loading", failures: 0, again: false };
    const failed = { phase: "failed", failures: 1, again: false };
    expect(changes).toEqual([
      { before: idle, event: "open", after: loading },
      { before: loading, event: "failed", after: failed },
      { before: failed, event: "retry", after: { ...failed, phase: "loading" } },
    ]);
  });

  it("a new snapshot only at a change, the same one in between", () => {
    const { leaflet } = fakeImport();
    const first = leaflet.snapshot();
    leaflet.retry();
    expect(leaflet.snapshot()).toBe(first);
    leaflet.open();
    expect(leaflet.snapshot()).not.toBe(first);
  });
});

/*
 * #567: the import is the page's, not the document's. Left by a client-side navigation, the
 * page's maps no longer read it; back on an event page, a failure is forgotten: the opening of
 * a map is a first attempt again. A map that only remounts on the page (a retour added: the
 * aller moves into its tab) reads it again in the same commit, and keeps it.
 */
describe("Leaflet's import, for as long as a page reads it (#567)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("failed, then read by no map: back on a page, a fresh state, and the opening asks again", async () => {
    vi.useFakeTimers();
    const { leaflet, calls, end, unsubscribe } = fakeImport();
    leaflet.open();
    await end("failed");
    leaflet.retry();
    await end("failed");
    expect(leaflet.snapshot().state).toEqual({ phase: "failed", failures: 2, again: true });

    unsubscribe();
    vi.runAllTimers();
    expect(leaflet.snapshot().state).toEqual({ phase: "idle", failures: 0, again: false });

    leaflet.subscribe(() => {});
    leaflet.open();
    expect(calls).toHaveLength(3);
    await end("failed");
    expect(leaflet.snapshot().state).toEqual({ phase: "failed", failures: 1, again: false });
  });

  it("failed while no map reads it: back on a page, a fresh state", async () => {
    vi.useFakeTimers();
    const { leaflet, end, unsubscribe } = fakeImport();
    leaflet.open();
    unsubscribe();
    vi.runAllTimers();
    expect(leaflet.snapshot().state.phase).toBe("loading");
    await end("failed");
    vi.runAllTimers();
    expect(leaflet.snapshot().state).toEqual({ phase: "idle", failures: 0, again: false });
  });

  it("a map remounted on the page, read again at once: the failure stays, the opening asks nothing", async () => {
    vi.useFakeTimers();
    const { leaflet, calls, end, unsubscribe } = fakeImport();
    leaflet.open();
    await end("failed");
    const failed = leaflet.snapshot();

    unsubscribe();
    leaflet.subscribe(() => {});
    vi.runAllTimers();
    expect(leaflet.snapshot()).toBe(failed);
    leaflet.open();
    expect(calls).toHaveLength(1);
  });

  it("loaded, then read by no map: the module stays, no request more", async () => {
    vi.useFakeTimers();
    const { leaflet, calls, end, unsubscribe } = fakeImport();
    leaflet.open();
    await end("loaded");
    const ready = leaflet.snapshot();
    unsubscribe();
    vi.runAllTimers();
    expect(leaflet.snapshot()).toBe(ready);
    leaflet.subscribe(() => {});
    leaflet.open();
    expect(calls).toHaveLength(1);
  });
});
