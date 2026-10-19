import { describe, expect, it, vi } from "vitest";
import { keepFolded, organiserFold, readFolded, type FoldStorage } from "./organiser-fold";

/** A `localStorage` in memory, whose every call is a spy. */
function fakeStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: vi.fn((key: string) => items.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void items.set(key, value)),
    removeItem: vi.fn((key: string) => void items.delete(key)),
  };
}

function foldWith(storage: FoldStorage) {
  return organiserFold({ storage: () => storage });
}

/** Every key the storage was given, by any of its methods. */
function keysPassed(storage: ReturnType<typeof fakeStorage>): string[] {
  return [storage.getItem, storage.setItem, storage.removeItem].flatMap((spy) =>
    spy.mock.calls.map(([key]) => key),
  );
}

const insecure = () => {
  throw new DOMException("The operation is insecure.", "SecurityError");
};
const full = () => {
  throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
};

const A = "Ab3dEf7h";
const B = "Xy4zWv9k";
const KEY_A = `fullcar:organiser-folded:${A}`;

describe("readFolded", () => {
  // O8.5: folded only when the event's key holds exactly "1".
  it.each<[string, boolean, string | undefined]>([
    ["no key", false, undefined],
    ['"1"', true, "1"],
    ['"0"', false, "0"],
    ['"true"', false, "true"],
    ["an empty string", false, ""],
    ['" 1"', false, " 1"],
    ['"11"', false, "11"],
  ])("with %s, is %s", (_, folded, value) => {
    const storage = fakeStorage(value === undefined ? {} : { [KEY_A]: value });
    expect(foldWith(storage).readFolded(A)).toBe(folded);
    expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(KEY_A);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  // O8.5: a storage that throws reads as unfolded, with no message.
  it("is false, and throws nothing, when getItem throws", () => {
    const storage = { ...fakeStorage({ [KEY_A]: "1" }), getItem: vi.fn(insecure) };
    expect(foldWith(storage).readFolded(A)).toBe(false);
  });

  // O8.5: some browsers throw on the `localStorage` property itself.
  it("is false, and throws nothing, when localStorage cannot be reached", () => {
    expect(organiserFold({ storage: insecure }).readFolded(A)).toBe(false);
  });
});

describe("keepFolded", () => {
  // O8.5: folding writes the event's key, with "1", and nothing else.
  it("writes the event's key once, with \"1\", when folded", () => {
    const storage = fakeStorage();
    foldWith(storage).keepFolded(A, true);
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(KEY_A, "1");
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect([...storage.items]).toEqual([[KEY_A, "1"]]);
  });

  // O8.5: unfolding removes the key: an unfolded panel has none.
  it("removes the event's key once when unfolded", () => {
    const storage = fakeStorage({ [KEY_A]: "1" });
    foldWith(storage).keepFolded(A, false);
    expect(storage.removeItem).toHaveBeenCalledExactlyOnceWith(KEY_A);
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.items.size).toBe(0);
  });

  it("throws nothing when setItem throws", () => {
    const storage = { ...fakeStorage(), setItem: vi.fn(full) };
    expect(() => foldWith(storage).keepFolded(A, true)).not.toThrow();
    expect(storage.setItem).toHaveBeenCalledOnce();
  });

  it("throws nothing when removeItem throws", () => {
    const storage = { ...fakeStorage({ [KEY_A]: "1" }), removeItem: vi.fn(insecure) };
    expect(() => foldWith(storage).keepFolded(A, false)).not.toThrow();
    expect(storage.removeItem).toHaveBeenCalledOnce();
  });

  it.each([true, false])("throws nothing when localStorage cannot be reached (folded: %s)", (folded) => {
    expect(() => organiserFold({ storage: insecure }).keepFolded(A, folded)).not.toThrow();
  });

  // A write that fails is not kept: the next read is unfolded (README, « L'état gardé »).
  it("reads unfolded after a write that failed", () => {
    const storage = { ...fakeStorage(), setItem: vi.fn(full) };
    const fold = foldWith(storage);
    fold.keepFolded(A, true);
    expect(fold.readFolded(A)).toBe(false);
  });
});

describe("per event", () => {
  // O8.5: folding event A does not fold event B.
  it("folding one event leaves another unfolded", () => {
    const storage = fakeStorage();
    const fold = foldWith(storage);
    fold.keepFolded(A, true);
    expect(fold.readFolded(A)).toBe(true);
    expect(fold.readFolded(B)).toBe(false);
    fold.keepFolded(A, false);
    expect(fold.readFolded(A)).toBe(false);
  });

  // O2.10 amended: the only key passed to the storage is the asked event's.
  it.each<[string, (fold: ReturnType<typeof organiserFold>) => void]>([
    ["readFolded", (fold) => fold.readFolded(A)],
    ["keepFolded(true)", (fold) => fold.keepFolded(A, true)],
    ["keepFolded(false)", (fold) => fold.keepFolded(A, false)],
  ])("%s passes only the event's own key", (_, act) => {
    const storage = fakeStorage({ [KEY_A]: "1", [`fullcar:organiser-folded:${B}`]: "1" });
    act(foldWith(storage));
    expect(keysPassed(storage)).toEqual([KEY_A]);
  });
});

describe("bound to window.localStorage", () => {
  // Under Node there is no `window`: reaching it throws, which reads as unfolded.
  it("reads unfolded, and throws nothing, without a window", () => {
    expect(readFolded(A)).toBe(false);
    expect(() => keepFolded(A, true)).not.toThrow();
    expect(() => keepFolded(A, false)).not.toThrow();
  });
});
