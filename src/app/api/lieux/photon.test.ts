import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { photonQuery, type PlaceQuery } from "@/domain/suggestion";
import { createPhoton, photonSettings } from "./photon";

const PHOTON = "https://photon.komoot.io/api/";
/** A whole second: an HTTP date (`Retry-After`) has no milliseconds. */
const START = Date.UTC(2026, 9, 23, 8, 0, 0);
const MINUTE = 60_000;
const HOUR = 3_600_000;

const query = (text: string): PlaceQuery => ({ text, locale: "fr", near: null });
const LILAS = query("12 rue des Lilas");

const MAIRIE = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [4.6894, 45.7581] },
  properties: { name: "Mairie", postcode: "69126", city: "Brindas", type: "house", country: "France", countrycode: "FR" },
};
const BRINDAS = { type: "FeatureCollection", features: [MAIRIE] };
const SUGGESTIONS = [{ label: "Mairie, 69126 Brindas", lat: 45.7581, lng: 4.6894 }];
const OK = { state: "ok", suggestions: SUGGESTIONS };
const UNAVAILABLE = { state: "unavailable" };

const json = (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init);
const status = (code: number, headers?: Record<string, string>) => new Response("Lilas: too many requests", { status: code, headers });

type Answer = (url: string, init: RequestInit) => Response | Promise<Response>;

/** Photon behind an injected `fetch` and clock: `answers` in turn, then Brindas. */
function setup(answers: Answer[] = [], options: { breakerMs?: number } = {}) {
  let time = START;
  const fetch = vi.fn((url: string, init: RequestInit) => Promise.resolve((answers.shift() ?? (() => json(BRINDAS)))(url, init)));
  const photon = createPhoton({ fetch: fetch as unknown as typeof globalThis.fetch, now: () => time, url: PHOTON, breakerMs: MINUTE, ...options });
  return {
    search: (q: PlaceQuery = LILAS) => photon.search(q),
    fetch,
    advance: (ms: number) => void (time += ms),
    at: () => time,
  };
}

/** Every line written to the console, by any of its methods. */
let logs: unknown[][];
beforeEach(() => {
  logs = [];
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, level).mockImplementation((...args) => void logs.push(args));
  }
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("a search", () => {
  it("asks Photon's URL for the query, and answers its suggestions", async () => {
    const { search, fetch } = setup();
    expect(await search()).toEqual(OK);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(photonQuery(PHOTON, LILAS));
  });

  it("sends only User-Agent, fullcar's, and Accept: no header of the visitor (AL6.1)", async () => {
    const { version } = JSON.parse(readFileSync(new URL("../../../../package.json", import.meta.url), "utf8"));
    const { search, fetch } = setup();
    await search();
    const init = fetch.mock.calls[0][1];
    expect([...new Headers(init.headers).entries()]).toEqual([
      ["accept", "application/json"],
      ["user-agent", `fullcar/${version} (+https://github.com/olaurendeau/fullcar)`],
    ]);
    expect(init.method ?? "GET").toBe("GET");
  });

  it("is kept out of Next's data cache, which outlives the instance", async () => {
    const { search, fetch } = setup();
    await search();
    expect(fetch.mock.calls[0][1].cache).toBe("no-store");
  });

  it("follows no redirect: the text never leaves for another host", async () => {
    const { search, fetch } = setup();
    await search();
    expect(fetch.mock.calls[0][1].redirect).toBe("error");
  });
});

describe("the cache (AL2.5)", () => {
  it("serves the same query within the hour, in any case and spacing, without a call", async () => {
    const { search, fetch, advance } = setup();
    await search();
    advance(HOUR - 1);
    expect(await search(query("12  RUE des lilas"))).toEqual(OK);
    expect(fetch).toHaveBeenCalledTimes(1);
    advance(1);
    expect(await search()).toEqual(OK);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("tells queries apart by their language and their area", async () => {
    const { search, fetch } = setup();
    await search();
    await search({ ...LILAS, locale: "en" });
    await search({ ...LILAS, near: { lat: 45.8, lng: 4.7 } });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("keeps an answer without suggestions", async () => {
    const { search, fetch } = setup([() => json({ type: "FeatureCollection", features: [] })]);
    expect(await search()).toEqual({ state: "ok", suggestions: [] });
    expect(await search()).toEqual({ state: "ok", suggestions: [] });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("never keeps unavailable", async () => {
    const { search, fetch } = setup([() => status(404)]);
    expect(await search()).toEqual(UNAVAILABLE);
    expect(await search()).toEqual(OK);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps 500 queries, and forgets the one least recently used", async () => {
    const { search, fetch, advance } = setup();
    const place = (n: number) => query(`lieu ${n}`);
    for (let n = 0; n < 500; n++) {
      await search(place(n));
      advance(200);
    }
    await search(place(0));
    expect(fetch).toHaveBeenCalledTimes(500);
    await search(place(500));
    advance(1000);
    await search(place(0));
    await search(place(2));
    expect(fetch).toHaveBeenCalledTimes(501);
    await search(place(1));
    expect(fetch).toHaveBeenCalledTimes(502);
  });
});

describe("the cap of 5 calls a second (AL2.5)", () => {
  it("answers the 6th call of a same second unavailable, without a call", async () => {
    const { search, fetch, advance } = setup();
    for (let n = 0; n < 5; n++) {
      expect(await search(query(`lieu ${n}`))).toEqual(OK);
      advance(100);
    }
    advance(499);
    expect(await search(query("lieu 5"))).toEqual(UNAVAILABLE);
    expect(fetch).toHaveBeenCalledTimes(5);
    advance(1);
    expect(await search(query("lieu 5"))).toEqual(OK);
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it("still serves the cache beyond it", async () => {
    const { search } = setup();
    for (let n = 0; n < 5; n++) await search(query(`lieu ${n}`));
    expect(await search(query("lieu 0"))).toEqual(OK);
  });
});

describe("the breaker (AL2.5)", () => {
  it("after a 429, makes no call for 60 s, and answers unavailable", async () => {
    const { search, fetch, advance } = setup([() => status(429)]);
    expect(await search()).toEqual(UNAVAILABLE);
    advance(MINUTE - 1);
    expect(await search(query("Brindas"))).toEqual(UNAVAILABLE);
    expect(fetch).toHaveBeenCalledTimes(1);
    advance(1);
    expect(await search(query("Brindas"))).toEqual(OK);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["seconds", "120", 2 * MINUTE],
    ["an HTTP date", new Date(START + 90_000).toUTCString(), 90_000],
  ])("after a 429, makes no call for as long as Retry-After says, in %s", async (_, retryAfter, ms) => {
    const { search, fetch, advance } = setup([() => status(429, { "Retry-After": retryAfter })]);
    await search();
    advance(ms - 1);
    expect(await search()).toEqual(UNAVAILABLE);
    expect(fetch).toHaveBeenCalledTimes(1);
    advance(1);
    expect(await search()).toEqual(OK);
  });

  it.each([
    ["soon", "soon"],
    ["a negative number", "-1"],
    ["a decimal number", "1.5"],
    ["words Node reads as a date", "next tuesday 3"],
    ["a date that is not an HTTP date", new Date(START + 2 * MINUTE).toISOString()],
    // 23 October 2026 is a Friday.
    ["an HTTP date with the wrong day", "Thu, 23 Oct 2026 08:02:00 GMT"],
    ["0", "0"],
    ["a date already past", new Date(START - MINUTE).toUTCString()],
  ])("stays open for its own duration, never less, when Retry-After is %s", async (_, retryAfter) => {
    const { search, fetch, advance } = setup([() => status(429, { "Retry-After": retryAfter })]);
    await search();
    advance(MINUTE - 1);
    await search();
    expect(fetch).toHaveBeenCalledTimes(1);
    advance(1);
    expect(await search()).toEqual(OK);
  });

  it.each([
    ["99999999999 seconds", "99999999999"],
    ["400 digits", "9".repeat(400)],
    ["a date in a year", new Date(START + 365 * 24 * HOUR).toUTCString()],
  ])("stays open for an hour at most, when Retry-After is %s", async (_, retryAfter) => {
    const { search, fetch, advance } = setup([() => status(429, { "Retry-After": retryAfter })]);
    await search();
    advance(HOUR - 1);
    await search();
    expect(fetch).toHaveBeenCalledTimes(1);
    advance(1);
    expect(await search()).toEqual(OK);
  });

  it("reads Retry-After with the whitespace HTTP allows around it", async () => {
    // `new Headers` would trim it; the headers of Node's `fetch` may keep it.
    const raw = () => Object.defineProperty(status(429), "headers", { value: { get: () => "120 " } });
    const { search, fetch, advance } = setup([raw]);
    await search();
    advance(2 * MINUTE - 1);
    await search();
    expect(fetch).toHaveBeenCalledTimes(1);
    advance(1);
    expect(await search()).toEqual(OK);
  });

  it.each([
    ["an integer of seconds longer than breakerMs", "2", 2_000],
    ["a decimal number, unread", "1.5", 1_000],
  ])("reads Retry-After as %s", async (_, retryAfter, ms) => {
    const { search, fetch, advance } = setup([() => status(429, { "Retry-After": retryAfter })], { breakerMs: 1_000 });
    await search();
    advance(ms - 1);
    await search();
    expect(fetch).toHaveBeenCalledTimes(1);
    advance(1);
    expect(await search()).toEqual(OK);
  });

  it("is not shortened by a failure that comes back after another", async () => {
    const { search, fetch, advance } = setup([() => status(429, { "Retry-After": "120" }), () => status(503)]);
    await Promise.all([search(), search(query("Brindas"))]);
    advance(2 * MINUTE - 1);
    expect(await search()).toEqual(UNAVAILABLE);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("stays open for breakerMs", async () => {
    const { search, fetch, advance } = setup([() => status(429)], { breakerMs: 10_000 });
    await search();
    advance(9_999);
    await search();
    expect(fetch).toHaveBeenCalledTimes(1);
    advance(1);
    expect(await search()).toEqual(OK);
  });

  it.each([500, 502, 503, 599])("opens on a %i too", async (code) => {
    const { search, fetch, advance } = setup([() => status(code)]);
    expect(await search()).toEqual(UNAVAILABLE);
    advance(MINUTE - 1);
    expect(await search()).toEqual(UNAVAILABLE);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a 404", () => status(404)],
    ["an answer that is not JSON", () => new Response("<html>")],
    ["an answer without features", () => json({ type: "FeatureCollection" })],
    ["a refused connection", () => Promise.reject(new TypeError("fetch failed"))],
  ])("does not open on %s, which is unavailable", async (_, answer) => {
    const { search, fetch } = setup([answer]);
    expect(await search()).toEqual(UNAVAILABLE);
    expect(await search()).toEqual(OK);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("never opens with breakerMs = 0, Retry-After included", async () => {
    const { search, fetch } = setup([() => status(429, { "Retry-After": "120" }), () => status(503)], { breakerMs: 0 });
    expect(await search()).toEqual(UNAVAILABLE);
    expect(await search()).toEqual(UNAVAILABLE);
    expect(await search()).toEqual(OK);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});

/** An answer that comes after `ms`, unless the request is aborted first. */
const after =
  (ms: number, answer: () => Response): Answer =>
  (_, init) =>
    new Promise((resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      setTimeout(() => resolve(answer()), ms);
    });

/** A body that sends its first bytes, then nothing more. */
function stalled(): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"type":'));
      },
    }),
  );
}

describe("the delay of 3 s (AL2.5)", () => {
  beforeEach(() => void vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));

  it("keeps an answer that comes within 3 s", async () => {
    const { search } = setup([after(2_999, () => json(BRINDAS))]);
    const pending = search();
    await vi.advanceTimersByTimeAsync(2_999);
    expect(await pending).toEqual(OK);
  });

  it("answers unavailable after 3 s without an answer, and opens the breaker", async () => {
    const { search, fetch, advance } = setup([after(10_000, () => json(BRINDAS))]);
    let settled = false;
    const pending = search().finally(() => (settled = true));
    await vi.advanceTimersByTimeAsync(2_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual(UNAVAILABLE);
    advance(MINUTE - 1);
    expect(await search()).toEqual(UNAVAILABLE);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("counts the body in the 3 s", async () => {
    const { search, fetch } = setup([stalled]);
    const pending = search();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(await pending).toEqual(UNAVAILABLE);
    expect(await search()).toEqual(UNAVAILABLE);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("the size of an answer", () => {
  const LIMIT = 65_536;
  /** Brindas, padded with spaces to `bytes`. */
  const padded = (bytes: number) => {
    const body = JSON.stringify(BRINDAS);
    return new Response(body + " ".repeat(bytes - new TextEncoder().encode(body).length));
  };

  it("reads an answer of 64 KiB", async () => {
    expect(await setup([() => padded(LIMIT)]).search()).toEqual(OK);
  });

  it("answers unavailable beyond, and stops reading", async () => {
    let pulled = 0;
    const endless = new ReadableStream({
      pull(controller) {
        pulled++;
        controller.enqueue(new Uint8Array(16_384).fill(32));
      },
    });
    expect(await setup([() => padded(LIMIT + 1)]).search()).toEqual(UNAVAILABLE);
    expect(await setup([() => new Response(endless)]).search()).toEqual(UNAVAILABLE);
    expect(pulled).toBeLessThan(10);
  });

  it("looks at the first 20 features only", async () => {
    const empty = { type: "Feature", properties: {} };
    const at = (position: number) => json({ type: "FeatureCollection", features: [...Array(position - 1).fill(empty), MAIRIE] });
    expect(await setup([() => at(20)]).search()).toEqual(OK);
    expect(await setup([() => at(21)]).search()).toEqual({ state: "ok", suggestions: [] });
  });
});

describe("what a failure leaves (AL6.3, AL6.6)", () => {
  const url = photonQuery(PHOTON, LILAS);

  it("logs nothing when Photon answers", async () => {
    await setup().search();
    expect(logs).toEqual([]);
  });

  it.each([
    ["a 429", () => status(429), "photon: unavailable (HTTP 429)"],
    ["a 503", () => status(503), "photon: unavailable (HTTP 503)"],
    ["an unreadable answer", () => new Response(`{"q":"12 rue des Lilas"`), "photon: unavailable (unreadable answer)"],
    ["a refused connection", () => Promise.reject(new TypeError(`fetch failed: ${url}`)), "photon: unavailable (no answer)"],
  ])("logs a fixed message and the status on %s, never the text, the URL nor the answer", async (_, answer, line) => {
    expect(await setup([answer]).search()).toEqual(UNAVAILABLE);
    expect(logs).toEqual([[line]]);
  });

  it("logs the delay as such", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = setup([after(10_000, () => json(BRINDAS))]).search();
    await vi.advanceTimersByTimeAsync(3_000);
    await pending;
    expect(logs).toEqual([["photon: unavailable (timeout)"]]);
  });

  it("logs nothing when the breaker answers", async () => {
    const { search } = setup([() => status(429)]);
    await search();
    await search();
    expect(logs).toEqual([["photon: unavailable (HTTP 429)"]]);
  });

  it("logs nothing when the cap answers", async () => {
    const { search, fetch } = setup();
    for (let n = 0; n < 6; n++) await search(query(`lieu ${n}`));
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(logs).toEqual([]);
  });

  it("throws nothing, so no error carries the URL: a fetch that throws it is unavailable", async () => {
    const { search } = setup([
      () => {
        throw new TypeError(`Failed to parse URL from ${url}`);
      },
    ]);
    await expect(search()).resolves.toEqual(UNAVAILABLE);
    expect(JSON.stringify(logs)).not.toContain("Lilas");
  });
});

describe("photonSettings", () => {
  it("defaults to komoot's public instance and a breaker of 60 s", () => {
    expect(photonSettings({})).toEqual({ url: PHOTON, breakerMs: MINUTE });
  });

  it("reads PHOTON_URL and PLACES_BREAKER_MS", () => {
    expect(photonSettings({ PHOTON_URL: "http://photon:2322/api/", PLACES_BREAKER_MS: "0" })).toEqual({
      url: "http://photon:2322/api/",
      breakerMs: 0,
    });
    expect(photonSettings({ PLACES_BREAKER_MS: "15000" }).breakerMs).toBe(15_000);
  });

  it.each(["", " ", "-1", "1.5", "1e3", "soon"])("ignores PLACES_BREAKER_MS = %j", (value) => {
    expect(photonSettings({ PHOTON_URL: "", PLACES_BREAKER_MS: value })).toEqual({ url: PHOTON, breakerMs: MINUTE });
  });
});
