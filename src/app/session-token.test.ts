import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { browserUnsafeReached } from "@/domain/test-browser-safe";
import { forgetSessionToken, readSessionToken, sendVisit, sessionTokens, type TokenStorage } from "./session-token";

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

const tokensOf = (storage: TokenStorage) => sessionTokens({ storage: () => storage });

/** Every key the storage was given, by any of its methods. */
function keysPassed(storage: ReturnType<typeof fakeStorage>): string[] {
  return [storage.getItem, storage.setItem, storage.removeItem].flatMap((spy) => spy.mock.calls.map(([key]) => key));
}

const insecure = () => {
  throw new DOMException("The operation is insecure.", "SecurityError");
};

const KEY = "fullcar:session";
/** Shaped as server-token.ts draws a token: 22 base64url characters for 16 bytes. */
const TOKEN = "kP3x-Vb7_Zq9Lt2Wn8Rc4g";
const OTHER = "Zq9Lt2Wn8Rc4gkP3x-Vb7A";

const CONSOLE = ["log", "info", "warn", "error", "debug", "trace"] as const;

describe("readSessionToken", () => {
  it("reads the token kept under fullcar:session, and writes nothing", () => {
    const storage = fakeStorage({ [KEY]: TOKEN });
    expect(tokensOf(storage).readSessionToken()).toBe(TOKEN);
    expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(KEY);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it.each([
    ["no key", undefined],
    ["an empty string", ""],
    ["a token one character short", TOKEN.slice(1)],
    ["a token one character long", `${TOKEN}A`],
    ["a last character no 16 bytes end with", `${TOKEN.slice(0, -1)}h`],
    ["a character outside base64url", `${TOKEN.slice(0, -2)}+g`],
    ["spaces around a token", ` ${TOKEN} `],
  ])("reads no token from %s", (_, value) => {
    const storage = fakeStorage(value === undefined ? {} : { [KEY]: value });
    expect(tokensOf(storage).readSessionToken()).toBeUndefined();
  });

  // Some browsers throw on the `localStorage` property itself.
  it("reads no token, and throws nothing, when localStorage cannot be reached", () => {
    expect(sessionTokens({ storage: insecure }).readSessionToken()).toBeUndefined();
  });
});

describe("sendVisit", () => {
  // Architecture, « Session, liens et jeton d'admin »: without a session, a page load asks nothing.
  it("sends nothing without a token", async () => {
    const storage = fakeStorage();
    const send = vi.fn();
    expect(await tokensOf(storage).sendVisit(send)).toBe("none");
    expect(send).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it("sends nothing when localStorage cannot be reached", async () => {
    const send = vi.fn();
    expect(await sessionTokens({ storage: insecure }).sendVisit(send)).toBe("none");
    expect(send).not.toHaveBeenCalled();
  });

  // OA9.7: the page load sends the token, and the session stays in the browser.
  it("sends the token alone, once, and keeps it while the session is open", async () => {
    const storage = fakeStorage({ [KEY]: TOKEN });
    const send = vi.fn(async () => ({ session: "open" }));
    expect(await tokensOf(storage).sendVisit(send)).toBe("open");
    expect(send.mock.calls).toEqual([[TOKEN]]);
    expect([...storage.items]).toEqual([[KEY, TOKEN]]);
  });

  // OA9.6: an ended session never comes back; the browser forgets its token.
  it("forgets the token of an ended session", async () => {
    const storage = fakeStorage({ [KEY]: TOKEN });
    expect(await tokensOf(storage).sendVisit(async () => ({ session: "ended" }))).toBe("ended");
    expect(storage.items.size).toBe(0);
  });

  // Another tab may open a new session while the visit is on its way: that one stays.
  it("keeps a token another tab stored while the visit was on its way", async () => {
    const storage = fakeStorage({ [KEY]: TOKEN });
    const send = async () => {
      storage.items.set(KEY, OTHER);
      return { session: "ended" };
    };
    expect(await tokensOf(storage).sendVisit(send)).toBe("ended");
    expect([...storage.items]).toEqual([[KEY, OTHER]]);
  });

  // Offline, or the server failed: nothing says the session ended.
  it.each<[string, () => Promise<unknown>]>([
    ["the request fails", async () => Promise.reject(new TypeError("Failed to fetch"))],
    ["the answer is undefined, as Next resolves a redirect", async () => undefined],
    ["the answer is of another shape", async () => ({ session: "closed" })],
  ])("keeps the token when %s", async (_, send) => {
    const storage = fakeStorage({ [KEY]: TOKEN });
    expect(await tokensOf(storage).sendVisit(send)).toBe("failed");
    expect([...storage.items]).toEqual([[KEY, TOKEN]]);
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it("touches no key but fullcar:session", async () => {
    const storage = fakeStorage({ [KEY]: TOKEN, "fullcar:personal-token:Ab3dEf7h": OTHER });
    await tokensOf(storage).sendVisit(async () => ({ session: "ended" }));
    expect(new Set(keysPassed(storage))).toEqual(new Set([KEY]));
    expect([...storage.items]).toEqual([["fullcar:personal-token:Ab3dEf7h", OTHER]]);
  });

  // Architecture, « Jetons »: a token is never logged, even when the visit fails.
  it.each<[string, () => Promise<unknown>]>([
    ["is open", async () => ({ session: "open" })],
    ["is ended", async () => ({ session: "ended" })],
    ["fails", async () => Promise.reject(new Error("visit: the visit could not be stored"))],
  ])("logs nothing when the visit %s", async (_, send) => {
    const spies = CONSOLE.map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
    try {
      await tokensOf(fakeStorage({ [KEY]: TOKEN })).sendVisit(send);
      expect(spies.flatMap((spy) => spy.mock.calls)).toEqual([]);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});

describe("forgetSessionToken", () => {
  // OA9.1: « Se déconnecter » leaves this browser without its session.
  it("forgets the token sent, and touches no other key", () => {
    const storage = fakeStorage({ [KEY]: TOKEN, "fullcar:admin-token:Ab3dEf7h": OTHER });
    tokensOf(storage).forgetSessionToken(TOKEN);
    expect([...storage.items]).toEqual([["fullcar:admin-token:Ab3dEf7h", OTHER]]);
    expect(new Set(keysPassed(storage))).toEqual(new Set([KEY]));
  });

  // Another tab may open a new session while the sign-out is on its way: that one stays.
  it("keeps a token other than the one sent", () => {
    const storage = fakeStorage({ [KEY]: OTHER });
    tokensOf(storage).forgetSessionToken(TOKEN);
    expect([...storage.items]).toEqual([[KEY, OTHER]]);
  });

  it("throws nothing when localStorage cannot be reached", () => {
    expect(() => sessionTokens({ storage: insecure }).forgetSessionToken(TOKEN)).not.toThrow();
  });
});

describe("bound to window.localStorage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forgets in window.localStorage", () => {
    const local = fakeStorage({ [KEY]: TOKEN });
    vi.stubGlobal("window", { localStorage: local });
    forgetSessionToken(TOKEN);
    expect(local.items.size).toBe(0);
  });

  it("reads and forgets in window.localStorage only", async () => {
    const local = fakeStorage({ [KEY]: TOKEN });
    const session = fakeStorage({ [KEY]: OTHER });
    vi.stubGlobal("window", { localStorage: local, sessionStorage: session });
    expect(readSessionToken()).toBe(TOKEN);
    expect(await sendVisit(async () => ({ session: "ended" }))).toBe("ended");
    expect(local.items.size).toBe(0);
    expect(keysPassed(session)).toEqual([]);
  });

  // Under Node there is no `window`: reaching it throws, which reads as no session.
  it("reads no token, and sends nothing, without a window", async () => {
    const send = vi.fn();
    expect(readSessionToken()).toBeUndefined();
    expect(await sendVisit(send)).toBe("none");
    expect(send).not.toHaveBeenCalled();
  });
});

describe("session-token module", () => {
  const file = fileURLToPath(new URL("./session-token.ts", import.meta.url));

  // The browser loads it, through session-visit.tsx in the root layout.
  it("reaches no Node built-in, through any of its imports", () => {
    expect(browserUnsafeReached(readFileSync(file, "utf8"), file)).toEqual([]);
  });
});
