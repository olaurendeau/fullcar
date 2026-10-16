import { describe, expect, it, vi } from "vitest";
import { isCreationId } from "@/domain/creation-id";
import { isPersonalToken } from "@/domain/personal-token";
import { deviceTokens, newCreationId, startDevice, type DeviceStorage } from "./device-token";

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

/** A `localStorage` that refuses everything, as a blocked or full one does (C1.14). */
const brokenStorage: DeviceStorage = {
  getItem: () => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  },
  setItem: () => {
    throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
  },
  removeItem: () => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  },
};

/** A source of randomness that writes 1, 2, 3… into each array it fills, and counts. */
function countingRandom() {
  let next = 0;
  return vi.fn((bytes: Uint8Array) => {
    for (let at = 0; at < bytes.length; at++) bytes[at] = ++next & 0xff;
  });
}

function tokensWith(storage: DeviceStorage, random = countingRandom()) {
  return { random, tokens: deviceTokens({ storage: () => storage, random }) };
}

const A = "Ab3dEf7h";
const B = "Xy4zWv9k";
const VALID = "q3Vx9kLmN2pR7sT1uW4yZQ";

describe("ensureDeviceToken", () => {
  // C1.5: 16 bytes of getRandomValues, as a canonical 22-character token.
  it("draws 16 bytes and gives a personal token", () => {
    const storage = fakeStorage();
    const { random, tokens } = tokensWith(storage);
    const token = tokens.ensureDeviceToken(A);
    expect(random).toHaveBeenCalledOnce();
    expect(random.mock.calls[0][0]).toHaveLength(16);
    expect(isPersonalToken(token)).toBe(true);
  });

  // C1.5, D4: the token is on the device before the request that creates the person leaves.
  it("stores the token under the event's key before the request is sent", () => {
    const storage = fakeStorage();
    const { tokens } = tokensWith(storage);
    const send = vi.fn((token: string) => token);

    send(tokens.ensureDeviceToken(A));

    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(`fullcar:personal-token:${A}`, send.mock.calls[0][0]);
    expect(storage.setItem.mock.invocationCallOrder[0]).toBeLessThan(send.mock.invocationCallOrder[0]);
  });

  // C1.5: a second creation carries the same token, and draws nothing more.
  it("gives the stored token again on a second call", () => {
    const storage = fakeStorage();
    const { random, tokens } = tokensWith(storage);
    const first = tokens.ensureDeviceToken(A);
    expect(tokens.ensureDeviceToken(A)).toBe(first);
    expect(random).toHaveBeenCalledOnce();
  });

  // C1.5: after a reload (a new page, the same localStorage), the device keeps its token.
  it("finds the token stored by an earlier page", () => {
    const storage = fakeStorage({ [`fullcar:personal-token:${A}`]: VALID });
    const { random, tokens } = tokensWith(storage);
    expect(tokens.ensureDeviceToken(A)).toBe(VALID);
    expect(random).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  // C1.7: one key and one token per event.
  it("gives two events two keys and two tokens", () => {
    const storage = fakeStorage();
    const { tokens } = tokensWith(storage);
    const a = tokens.ensureDeviceToken(A);
    const b = tokens.ensureDeviceToken(B);
    expect(a).not.toBe(b);
    expect([...storage.items]).toEqual([
      [`fullcar:personal-token:${A}`, a],
      [`fullcar:personal-token:${B}`, b],
    ]);
    expect(tokens.readDeviceToken(A)).toBe(a);
    expect(tokens.readDeviceToken(B)).toBe(b);
  });

  // A malformed stored token is not one: a new one replaces it.
  it.each([
    ["too short", "q3Vx9kLmN2pR7sT1uW4yZ"],
    ["too long", `${VALID}A`],
    ["out of the alphabet", "q3Vx9kLmN2pR7sT1uW4y+Q"],
    ["not canonical", "q3Vx9kLmN2pR7sT1uW4yZB"],
    ["empty", ""],
  ])("replaces a stored token that is %s", (_, stored) => {
    const storage = fakeStorage({ [`fullcar:personal-token:${A}`]: stored });
    const { random, tokens } = tokensWith(storage);
    const token = tokens.ensureDeviceToken(A);
    expect(token).not.toBe(stored);
    expect(isPersonalToken(token)).toBe(true);
    expect(random).toHaveBeenCalledOnce();
    expect(storage.items.get(`fullcar:personal-token:${A}`)).toBe(token);
  });

  // C1.14, D5: without localStorage, the token lives in the page's memory.
  it("keeps the token in the page's memory when localStorage throws", () => {
    const { random, tokens } = tokensWith(brokenStorage);
    const token = tokens.ensureDeviceToken(A);
    expect(isPersonalToken(token)).toBe(true);
    expect(tokens.readDeviceToken(A)).toBe(token);
    expect(tokens.ensureDeviceToken(A)).toBe(token);
    expect(random).toHaveBeenCalledOnce();
    expect(tokens.readDeviceToken(B)).toBeUndefined();
  });

  // C1.14: some browsers throw on the `localStorage` property itself.
  it("keeps the token in memory when localStorage cannot even be reached", () => {
    const tokens = deviceTokens({
      storage: () => {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
      random: countingRandom(),
    });
    const token = tokens.ensureDeviceToken(A);
    expect(tokens.readDeviceToken(A)).toBe(token);
  });

  // A storage that accepts the write but keeps nothing is no storage either.
  it("keeps the token in memory when localStorage drops the write", () => {
    const storage = { ...fakeStorage(), setItem: vi.fn() };
    const { tokens } = tokensWith(storage);
    const token = tokens.ensureDeviceToken(A);
    expect(tokens.readDeviceToken(A)).toBe(token);
  });

  // No randomness, no token: nothing weaker is stored in its place.
  it("throws, and stores nothing, when the randomness fails", () => {
    const storage = fakeStorage();
    const tokens = deviceTokens({
      storage: () => storage,
      random: () => {
        throw new Error("no randomness");
      },
    });
    expect(() => tokens.ensureDeviceToken(A)).toThrow("no randomness");
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(tokens.readDeviceToken(A)).toBeUndefined();
  });

  // C1.14: once this page keeps its token in memory, another tab that stores one for the
  // same event does not change who this page is.
  it("keeps the page's token over the one another tab stores later", () => {
    const storage = fakeStorage();
    const { tokens } = tokensWith({
      ...storage,
      setItem: () => {
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      },
    });
    const token = tokens.ensureDeviceToken(A);
    storage.items.set(`fullcar:personal-token:${A}`, VALID);
    expect(tokens.readDeviceToken(A)).toBe(token);
    expect(tokens.ensureDeviceToken(A)).toBe(token);
  });
});

describe("readDeviceToken", () => {
  it("reads the event's stored token", () => {
    const { tokens } = tokensWith(fakeStorage({ [`fullcar:personal-token:${A}`]: VALID }));
    expect(tokens.readDeviceToken(A)).toBe(VALID);
    expect(tokens.readDeviceToken(B)).toBeUndefined();
  });

  // A malformed stored token is ignored.
  it.each([
    ["too short", "q3Vx9kLmN2pR7sT1uW4yZ"],
    ["not canonical", "q3Vx9kLmN2pR7sT1uW4yZB"],
    ["empty", ""],
  ])("ignores a stored token that is %s", (_, stored) => {
    const { tokens } = tokensWith(fakeStorage({ [`fullcar:personal-token:${A}`]: stored }));
    expect(tokens.readDeviceToken(A)).toBeUndefined();
  });

  // C1.7: another event's token is not this event's.
  it("does not take another event's token", () => {
    const { tokens } = tokensWith(fakeStorage({ [`fullcar:personal-token:${B}`]: VALID }));
    expect(tokens.readDeviceToken(A)).toBeUndefined();
  });

  it("reads nothing, and throws nothing, when localStorage throws", () => {
    const { tokens } = tokensWith(brokenStorage);
    expect(tokens.readDeviceToken(A)).toBeUndefined();
  });
});

describe("storageAvailable", () => {
  it("is true for a working localStorage, which it leaves as it found it", () => {
    const storage = fakeStorage();
    const { tokens } = tokensWith(storage);
    expect(tokens.storageAvailable()).toBe(true);
    expect(storage.setItem).toHaveBeenCalledOnce();
    expect(storage.items.size).toBe(0);
  });

  // C1.14: the form warns before the registration.
  it("is false when localStorage throws", () => {
    const { tokens } = tokensWith(brokenStorage);
    expect(tokens.storageAvailable()).toBe(false);
  });

  // C1.14: a storage that keeps nothing would lose the token on reload: the form warns.
  it("is false when localStorage drops the write", () => {
    const storage = { ...fakeStorage(), setItem: vi.fn() };
    const { tokens } = tokensWith(storage);
    expect(tokens.storageAvailable()).toBe(false);
  });

  it("is false when localStorage cannot be reached", () => {
    const tokens = deviceTokens({
      storage: () => {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
      random: countingRandom(),
    });
    expect(tokens.storageAvailable()).toBe(false);
  });

  // The probe's key says nothing of the events the device has seen.
  it("probes with a key that names no event", () => {
    const storage = fakeStorage();
    const { tokens } = tokensWith(storage);
    tokens.storageAvailable();
    const [key] = storage.setItem.mock.calls[0];
    expect(key).not.toContain("personal-token");
    expect(key).not.toContain(A);
  });
});

describe("C1.13: a visitor who registers no one leaves nothing for the event", () => {
  it("writes nothing for the event when reading, probing and loading the device", () => {
    const storage = fakeStorage();
    const { random, tokens } = tokensWith(storage);
    tokens.readDeviceToken(A);
    tokens.storageAvailable();
    const stop = startDevice(tokens.readDeviceToken(A), vi.fn(), vi.fn(), vi.fn());
    stop();
    expect(storage.items.size).toBe(0);
    expect(storage.setItem.mock.calls.filter(([key]) => key.includes(A))).toEqual([]);
    expect(random).not.toHaveBeenCalled();
  });
});

describe("newCreationId", () => {
  // C12.4: a uuid v4 drawn by the browser, from getRandomValues.
  it("draws a uuid v4 from 16 bytes", () => {
    const storage = fakeStorage();
    const { random, tokens } = tokensWith(storage);
    const id = tokens.newCreationId();
    expect(isCreationId(id)).toBe(true);
    expect(random.mock.calls[0][0]).toHaveLength(16);
    expect(tokens.newCreationId()).not.toBe(id);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

describe("the browser's instance", () => {
  it("draws with the platform's crypto.getRandomValues", () => {
    const getRandomValues = vi.spyOn(globalThis.crypto, "getRandomValues");
    expect(isCreationId(newCreationId())).toBe(true);
    expect(getRandomValues).toHaveBeenCalledOnce();
    getRandomValues.mockRestore();
  });
});

describe("startDevice", () => {
  /** A load whose answer the test gives, when it wants. */
  function deferredLoad<T>() {
    const calls: { token: string; resolve(value: T): void; reject(error: unknown): void }[] = [];
    const load = vi.fn(
      (token: string) =>
        new Promise<T>((resolve, reject) => {
          calls.push({ token, resolve, reject });
        }),
    );
    return { load, calls };
  }

  // No key for the event: no person, and nothing to ask the server.
  it("reports none without a token, and loads nothing", () => {
    const { load } = deferredLoad();
    const report = vi.fn();
    startDevice(undefined, load, vi.fn(), report);
    expect(report.mock.calls).toEqual([["none"]]);
    expect(load).not.toHaveBeenCalled();
  });

  // C5.9: loading while the device's persons are read, then ready with what was read.
  it("loads the device's persons with its token, then is ready", async () => {
    const { load, calls } = deferredLoad<string>();
    const report = vi.fn();
    const loaded = vi.fn();
    startDevice(VALID, load, loaded, report);
    expect(report.mock.calls).toEqual([["loading"]]);
    expect(load).toHaveBeenCalledExactlyOnceWith(VALID);

    calls[0].resolve("the event's state");
    await vi.waitFor(() => expect(report).toHaveBeenLastCalledWith("ready"));
    expect(loaded).toHaveBeenCalledExactlyOnceWith("the event's state");
    expect(loaded.mock.invocationCallOrder[0]).toBeLessThan(report.mock.invocationCallOrder[1]);
  });

  // The page offers to retry.
  it("reports failed when the load fails", async () => {
    const { load, calls } = deferredLoad();
    const report = vi.fn();
    const loaded = vi.fn();
    startDevice(VALID, load, loaded, report);
    calls[0].reject(new Error("offline"));
    await vi.waitFor(() => expect(report).toHaveBeenLastCalledWith("failed"));
    expect(loaded).not.toHaveBeenCalled();
  });

  // A load the page no longer waits for (another event, a retry, an unmount) changes nothing.
  it("ignores the answer of a stopped load", async () => {
    const { load, calls } = deferredLoad();
    const report = vi.fn();
    const loaded = vi.fn();
    const stop = startDevice(VALID, load, loaded, report);
    stop();
    calls[0].resolve("late");
    await Promise.resolve();
    await Promise.resolve();
    expect(report.mock.calls).toEqual([["loading"]]);
    expect(loaded).not.toHaveBeenCalled();
  });

  // A first load that fails after a retry has succeeded does not turn the page to failed.
  it("ignores the failure of a stopped load", async () => {
    const { load, calls } = deferredLoad();
    const report = vi.fn();
    const stop = startDevice(VALID, load, vi.fn(), report);
    stop();
    calls[0].reject(new Error("late"));
    await Promise.resolve();
    await Promise.resolve();
    expect(report.mock.calls).toEqual([["loading"]]);
  });
});
