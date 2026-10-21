import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { browserUnsafeReached } from "@/domain/test-browser-safe";
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
/** Shaped as the organiser's token (22 base64url characters): never part of a key. */
const TOKEN = "kP3x-Vb7_Zq9Lt2Wn8Rc4g";

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

describe("only for an event's public id", () => {
  // O2.10 amended: a token passed by mistake never reaches the storage, nor does anything
  // else that is not a public id. It reads as unfolded and nothing is written.
  it.each([
    ["the organiser's token", TOKEN],
    ["the token behind a #", `#${TOKEN}`],
    ["an empty string", ""],
    ["an id with a path after it", `${A}/admin`],
    ["an id with a newline after it", `${A}\n`],
    ["an id one symbol short", A.slice(1)],
  ])("%s reads unfolded and never reaches the storage", (_, id) => {
    const key = `fullcar:organiser-folded:${id}`;
    const storage = fakeStorage({ [key]: "1" });
    const reach = vi.fn(() => storage);
    const fold = organiserFold({ storage: reach });
    expect(fold.readFolded(id)).toBe(false);
    fold.keepFolded(id, true);
    fold.keepFolded(id, false);
    expect(reach).not.toHaveBeenCalled();
    expect(keysPassed(storage)).toEqual([]);
    expect([...storage.items]).toEqual([[key, "1"]]);
  });
});

describe("console", () => {
  const methods = ["log", "info", "warn", "error", "debug", "trace"] as const;
  const throwing = (method: "getItem" | "setItem" | "removeItem", error: () => never) => () =>
    organiserFold({ storage: () => ({ ...fakeStorage({ [KEY_A]: "1" }), [method]: error }) });

  // O8.5: a storage that fails is dropped with no message and no log.
  it.each<[string, () => void]>([
    ["getItem throws", () => throwing("getItem", insecure)().readFolded(A)],
    ["setItem throws", () => throwing("setItem", full)().keepFolded(A, true)],
    ["removeItem throws", () => throwing("removeItem", insecure)().keepFolded(A, false)],
    ["localStorage cannot be reached, on a read", () => organiserFold({ storage: insecure }).readFolded(A)],
    ["localStorage cannot be reached, on a write", () => organiserFold({ storage: insecure }).keepFolded(A, true)],
    ["the id is a token", () => foldWith(fakeStorage()).keepFolded(TOKEN, true)],
  ])("receives nothing when %s", (_, act) => {
    const spies = methods.map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
    try {
      act();
      expect(spies.flatMap((spy) => spy.mock.calls)).toEqual([]);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});

describe("bound to window.localStorage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // O8.5: the bound functions read, write and remove in `window.localStorage`, and in no
  // other storage of the window.
  it("reads, writes and removes the event's key in window.localStorage only", () => {
    const local = fakeStorage();
    const session = fakeStorage();
    vi.stubGlobal("window", { localStorage: local, sessionStorage: session });
    keepFolded(A, true);
    expect([...local.items]).toEqual([[KEY_A, "1"]]);
    expect(readFolded(A)).toBe(true);
    keepFolded(A, false);
    expect(local.items.size).toBe(0);
    expect(readFolded(A)).toBe(false);
    expect(keysPassed(session)).toEqual([]);
  });

  // Under Node there is no `window`: reaching it throws, which reads as unfolded.
  it("reads unfolded, and throws nothing, without a window", () => {
    expect(readFolded(A)).toBe(false);
    expect(() => keepFolded(A, true)).not.toThrow();
    expect(() => keepFolded(A, false)).not.toThrow();
  });
});

describe("organiser-fold module", () => {
  const file = fileURLToPath(new URL("./organiser-fold.ts", import.meta.url));
  const source = readFileSync(file, "utf8");

  // The browser loads it: its id check comes from public-id-format, not from public-id, which
  // draws ids with node:crypto. Its imports are followed, however they are written (#204).
  it("reaches no Node built-in, through any of its imports", () => {
    expect(browserUnsafeReached(source, file)).toEqual([]);
  });

  it.each(["@/domain/public-id", "../../../../domain/public-id", "../../../../domain/public-id.ts"])(
    "finds node:crypto behind an import of the module that draws ids, written %s",
    (spelling) => {
      const imported = `import { isPublicId } from "${spelling}";\n${source}`;
      expect(browserUnsafeReached(imported, file)).toEqual(["domain/public-id.ts: node:crypto"]);
    },
  );
});
