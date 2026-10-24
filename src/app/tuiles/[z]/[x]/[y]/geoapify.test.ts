import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tile } from "@/domain/tile";
import { createGeoapify, geoapifySettings, type TileAnswer } from "./geoapify";

const GEOAPIFY = "https://maps.geoapify.com/v1/tile";
/** A key nothing else in a log could be mistaken for. */
const KEY = "fullcar-test-key-7f3a9c2e";
const PARIS: Tile = { z: 14, x: 8299, y: 5636 };
const PARIS_URL = `${GEOAPIFY}/positron/14/8299/5636@2x.png?apiKey=${KEY}`;

/** A whole second, as an HTTP date: `Retry-After` has no milliseconds. */
const START = Date.UTC(2026, 9, 24, 8, 0, 0);
const SECOND = 1_000;
const HOUR = 3_600_000;
const LIMIT = 2_097_152;

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
/** A tile: the PNG signature, then whatever follows, `bytes` long in all. */
const pngBytes = (bytes = 64) => Uint8Array.from({ length: bytes }, (_, i) => SIGNATURE[i] ?? i % 251);
const png = (bytes?: number, type = "image/png") => new Response(pngBytes(bytes), { headers: { "Content-Type": type } });
const status = (code: number, headers?: Record<string, string>) => new Response(`${KEY}: refused`, { status: code, headers });

type Answer = (url: string, init: RequestInit) => Response | Promise<Response>;
type Env = Record<string, string | undefined>;

const TILE = { state: "tile", png: pngBytes() };
const FAILED = { state: "failed" };

/**
 * Geoapify behind an injected `fetch` and clock, its settings read from `env` as the route
 * would read them (with the test key unless `env` says otherwise): `answers` in turn, then a tile.
 */
function setup(answers: Answer[] = [], env: Env = {}) {
  let time = START;
  const fetch = vi.fn((url: string, init: RequestInit) => Promise.resolve((answers.shift() ?? (() => png()))(url, init)));
  const geoapify = createGeoapify({
    fetch: fetch as unknown as typeof globalThis.fetch,
    now: () => time,
    ...geoapifySettings({ GEOAPIFY_API_KEY: KEY, ...env }),
  });
  return { tile: (tile: Tile = PARIS) => geoapify.tile(tile), fetch, advance: (ms: number) => void (time += ms) };
}

const state = (answer: TileAnswer) => answer.state;

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

describe("the request (CA3.2)", () => {
  it("asks {url}/{style}/{z}/{x}/{y}@2x.png with the key as its only query", async () => {
    const { tile, fetch } = setup();
    await tile();
    expect(fetch).toHaveBeenCalledTimes(1);
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.href).toBe(PARIS_URL);
    expect(url.pathname).toBe("/v1/tile/positron/14/8299/5636@2x.png");
    expect(url.search).toBe(`?apiKey=${KEY}`);
  });

  it("takes the style from TILE_STYLE", async () => {
    const { tile, fetch } = setup([], { TILE_STYLE: "osm-bright" });
    await tile({ z: 0, x: 0, y: 0 });
    expect(fetch.mock.calls[0][0]).toBe(`${GEOAPIFY}/osm-bright/0/0/0@2x.png?apiKey=${KEY}`);
  });

  it("drops the base's own query, fragment and trailing slash", async () => {
    const { tile, fetch } = setup([], { TILE_UPSTREAM_URL: "http://tiles:2324/v1/tile/?apiKey=other&style=dark#x" });
    await tile();
    expect(fetch.mock.calls[0][0]).toBe(`http://tiles:2324/v1/tile/positron/14/8299/5636@2x.png?apiKey=${KEY}`);
  });

  it("encodes the key, which cannot add a parameter", async () => {
    const { tile, fetch } = setup([], { GEOAPIFY_API_KEY: "a b&style=x#y" });
    await tile();
    expect(new URL(fetch.mock.calls[0][0]).search).toBe("?apiKey=a%20b%26style%3Dx%23y");
  });

  it("sends only User-Agent, fullcar's, and Accept: image/png", async () => {
    const { version } = JSON.parse(readFileSync(new URL("../../../../../../package.json", import.meta.url), "utf8"));
    const { tile, fetch } = setup();
    await tile();
    const init = fetch.mock.calls[0][1];
    expect([...new Headers(init.headers).entries()]).toEqual([
      ["accept", "image/png"],
      ["user-agent", `fullcar/${version} (+https://github.com/olaurendeau/fullcar)`],
    ]);
    expect(init.method ?? "GET").toBe("GET");
    expect(init.body).toBeUndefined();
  });

  it("is kept out of Next's data cache, and follows no redirect", async () => {
    const { tile, fetch } = setup();
    await tile();
    expect(fetch.mock.calls[0][1].cache).toBe("no-store");
    expect(fetch.mock.calls[0][1].redirect).toBe("error");
  });
});

describe("a tile (CA3.2)", () => {
  it("is a 200 image/png that starts with the PNG signature, its bytes as they came", async () => {
    expect(await setup().tile()).toEqual(TILE);
  });

  it("reads the media type in any case, with parameters", async () => {
    expect(state(await setup([() => png(64, "Image/PNG; charset=binary")]).tile())).toBe("tile");
  });

  it("reads a tile of 2 MiB", async () => {
    expect(state(await setup([() => png(LIMIT)]).tile())).toBe("tile");
  });
});

describe("everything else is failed (CA2.6, CA3.2)", () => {
  it.each([
    ["a 401", () => status(401)],
    ["a 403", () => status(403)],
    ["a 404", () => status(404)],
    ["a 429", () => status(429)],
    ["a 500", () => status(500)],
    ["a 503", () => status(503)],
    ["a 204", () => new Response(null, { status: 204 })],
    ["a 206 with a PNG", () => new Response(pngBytes(), { status: 206, headers: { "Content-Type": "image/png" } })],
    ["a 200 that is not image/png", () => png(64, "text/html")],
    ["a 200 without a media type", () => new Response(new Blob([pngBytes()]))],
    ["a 200 image/png that is not a PNG", () => new Response("<html>", { headers: { "Content-Type": "image/png" } })],
    ["a 200 image/png beyond 2 MiB", () => png(LIMIT + 1)],
    ["a refused connection", () => Promise.reject(new TypeError("fetch failed"))],
    ["a redirect, which fetch refuses", () => Promise.reject(new TypeError("unexpected redirect"))],
  ])("is %s", async (_, answer) => {
    expect(await setup([answer]).tile()).toEqual(FAILED);
  });

  it("is a fetch that throws, never thrown further", async () => {
    const throwing = () => {
      throw new TypeError(`Failed to parse URL from ${PARIS_URL}`);
    };
    await expect(setup([throwing]).tile()).resolves.toEqual(FAILED);
  });

  it("is a tile whose body breaks while it is read", async () => {
    const broken = new ReadableStream({
      start(controller) {
        controller.enqueue(Uint8Array.from(SIGNATURE));
        controller.error(new TypeError("terminated"));
      },
    });
    expect(state(await setup([() => new Response(broken, { headers: { "Content-Type": "image/png" } })]).tile())).toBe("failed");
  });

  it("stops reading a body beyond 2 MiB", async () => {
    let pulled = 0;
    const endless = new ReadableStream({
      pull(controller) {
        pulled += 65_536;
        controller.enqueue(new Uint8Array(65_536));
      },
    });
    expect(state(await setup([() => new Response(endless, { headers: { "Content-Type": "image/png" } })]).tile())).toBe("failed");
    expect(pulled).toBeLessThan(LIMIT + 4 * 65_536);
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

/** Headers, then the PNG signature, then nothing more. */
const stalled = () =>
  new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(Uint8Array.from(SIGNATURE));
      },
    }),
    { headers: { "Content-Type": "image/png" } },
  );

describe("the delay of 5 s (CA2.6)", () => {
  beforeEach(() => void vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));

  it("keeps an answer that comes within 5 s", async () => {
    const pending = setup([after(4_999, () => png())]).tile();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(state(await pending)).toBe("tile");
  });

  it("fails after 5 s without an answer", async () => {
    let settled = false;
    const pending = setup([after(60_000, () => png())])
      .tile()
      .finally(() => (settled = true));
    await vi.advanceTimersByTimeAsync(4_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual(FAILED);
  });

  it("counts the body in the 5 s", async () => {
    const pending = setup([stalled]).tile();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await pending).toEqual(FAILED);
  });
});

describe("without a key (CA3.5)", () => {
  it.each([
    ["unset", {}],
    ["empty", { GEOAPIFY_API_KEY: "" }],
    ["blank: spaces, a tab, line breaks", { GEOAPIFY_API_KEY: " \t\r\n " }],
  ])("fails without a call when the key is %s, and logs only « tiles: no key »", async (_, env) => {
    const { tile, fetch } = setup([], { GEOAPIFY_API_KEY: undefined, ...env });
    expect(await tile()).toEqual(FAILED);
    expect(fetch).not.toHaveBeenCalled();
    expect(logs).toEqual([["tiles: no key"]]);
  });
});

describe("a key pasted with spaces or a line break around it (#554)", () => {
  it("is trimmed before it is sent: the only query is the key itself", async () => {
    const { tile, fetch } = setup([], { GEOAPIFY_API_KEY: ` ${KEY}\r\n` });
    expect(await tile()).toEqual(TILE);
    expect(new URL(fetch.mock.calls[0][0]).search).toBe(`?apiKey=${KEY}`);
  });
});

describe("the breaker (CA3.6)", () => {
  /** After the first call, `ms - 1` without a call, then the next call at `ms`. */
  async function staysOpen(answer: Answer, ms: number, env: Env = {}) {
    const { tile, fetch, advance } = setup([answer], env);
    expect(await tile()).toEqual(FAILED);
    advance(ms - 1);
    expect(await tile()).toEqual(FAILED);
    expect(fetch).toHaveBeenCalledTimes(1);
    advance(1);
    expect(await tile()).toEqual(TILE);
    expect(fetch).toHaveBeenCalledTimes(2);
  }

  it("after a 429, makes no call for 10 s by default, and answers failed", async () => {
    await staysOpen(() => status(429), 10 * SECOND);
  });

  it.each([
    ["1", 10 * SECOND],
    ["120", 120 * SECOND],
    ["7200", HOUR],
    ["99999999999", HOUR],
    [new Date(START + 90 * SECOND).toUTCString(), 90 * SECOND],
  ])("after a 429 with Retry-After: %s, stays open the time Retry-After gives, between 10 s and 1 h", async (retryAfter, ms) => {
    await staysOpen(() => status(429, { "Retry-After": retryAfter }), ms);
  });

  it.each([
    ["soon", "soon"],
    ["a negative number", "-1"],
    ["a decimal number", "1.5"],
    ["a date that is not an HTTP date", new Date(START + 120 * SECOND).toISOString()],
    ["the obsolete RFC 850 form", "Saturday, 24-Oct-26 08:02:00 GMT"],
    ["the obsolete asctime form", "Sat Oct 24 08:02:00 2026"],
    ["a date already past", new Date(START - 60 * SECOND).toUTCString()],
  ])("stays open 10 s when Retry-After is %s", async (_, retryAfter) => {
    await staysOpen(() => status(429, { "Retry-After": retryAfter }), 10 * SECOND);
  });

  it("stays open for TILES_BREAKER_MS when it is all digits", async () => {
    await staysOpen(() => status(429), 20 * SECOND, { TILES_BREAKER_MS: "20000" });
  });

  it("stays open 10 s with TILES_BREAKER_MS=abc", async () => {
    await staysOpen(() => status(429), 10 * SECOND, { TILES_BREAKER_MS: "abc" });
  });

  it("never opens with TILES_BREAKER_MS=0, Retry-After included", async () => {
    const answers = [() => status(429, { "Retry-After": "120" }), () => status(429)];
    const { tile, fetch } = setup(answers, { TILES_BREAKER_MS: "0" });
    expect(await tile()).toEqual(FAILED);
    expect(await tile()).toEqual(FAILED);
    expect(await tile()).toEqual(TILE);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("answers failed while open without a call and without a log line", async () => {
    const { tile, fetch } = setup([() => status(429)]);
    await tile();
    logs.length = 0;
    expect(await tile()).toEqual(FAILED);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(logs).toEqual([]);
  });

  it("is not shortened by a 429 that comes back after another", async () => {
    const answers = [() => status(429, { "Retry-After": "120" }), () => status(429)];
    const { tile, fetch, advance } = setup(answers);
    await Promise.all([tile(), tile()]);
    advance(120 * SECOND - 1);
    expect(await tile()).toEqual(FAILED);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("is per instance", async () => {
    const limited = setup([() => status(429)]);
    await limited.tile();
    const other = setup();
    expect(await other.tile()).toEqual(TILE);
    expect(other.fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a 401", () => status(401)],
    ["a 403", () => status(403)],
    ["a 404", () => status(404)],
    ["a 500", () => status(500, { "Retry-After": "120" })],
    ["a 503", () => status(503, { "Retry-After": "120" })],
    ["a refused connection", () => Promise.reject(new TypeError("fetch failed"))],
    ["an answer that is not a PNG", () => png(64, "text/html")],
  ])("does not open on %s: the next call goes out", async (_, answer) => {
    const { tile, fetch } = setup([answer]);
    expect(await tile()).toEqual(FAILED);
    expect(await tile()).toEqual(TILE);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not open on the delay", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { tile, fetch } = setup([after(60_000, () => png())]);
    const pending = tile();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await pending).toEqual(FAILED);
    expect(await tile()).toEqual(TILE);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("what Geoapify's answer leaves in the logs (CA3.5)", () => {
  /** Nothing that names the key, the upstream or the tile. */
  const LEAK = /fullcar-test-key|apiKey|geoapify|tiles:2324|8299|5636|14\//i;
  const withUrl = (message: string) => Promise.reject(new TypeError(`${message}: ${PARIS_URL}`, { cause: new Error(PARIS_URL) }));

  it.each([
    ["a tile", [() => png()], []],
    ["a 401", [() => status(401)], ["tiles: tile failed (HTTP 401)"]],
    ["a 403", [() => status(403)], ["tiles: tile failed (HTTP 403)"]],
    ["a 404", [() => status(404)], ["tiles: tile failed (HTTP 404)"]],
    ["a 429", [() => status(429)], ["tiles: tile failed (HTTP 429)"]],
    ["a 500", [() => status(500)], ["tiles: tile failed (HTTP 500)"]],
    ["a network error that carries the URL", [() => withUrl("fetch failed")], ["tiles: tile failed (no answer)"]],
    ["a 200 that is not image/png", [() => png(64, "text/html")], ["tiles: tile failed (not a PNG)"]],
    ["a 200 image/png that is not a PNG", [() => new Response(KEY, { headers: { "Content-Type": "image/png" } })], ["tiles: tile failed (not a PNG)"]],
    ["a tile too large", [() => png(LIMIT + 1)], ["tiles: tile failed (answer too large)"]],
  ] as [string, Answer[], string[]][])("logs %s as a fixed line, never the key, the URL nor the tile", async (_, answers, lines) => {
    await setup(answers).tile();
    expect(logs).toEqual(lines.map((line) => [line]));
    expect(LEAK.test(JSON.stringify(logs))).toBe(false);
  });

  it("logs the delay as such", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = setup([after(60_000, () => png())]).tile();
    await vi.advanceTimersByTimeAsync(5_000);
    await pending;
    expect(logs).toEqual([["tiles: tile failed (timeout)"]]);
  });

  it("logs nothing while the breaker is open, and once for the 429 that opened it", async () => {
    const { tile } = setup([() => status(429, { "Retry-After": "120" })]);
    await tile();
    await tile();
    expect(logs).toEqual([["tiles: tile failed (HTTP 429)"]]);
  });

  it("logs no key without the URL", async () => {
    await setup([], { GEOAPIFY_API_KEY: "", TILE_UPSTREAM_URL: "http://tiles:2324/v1/tile" }).tile();
    expect(logs).toEqual([["tiles: no key"]]);
    expect(LEAK.test(JSON.stringify(logs))).toBe(false);
  });
});

describe("geoapifySettings", () => {
  it("defaults to Geoapify's tiles, positron, no key and 10 s", () => {
    const defaults = { url: GEOAPIFY, style: "positron", key: "", breakerMs: 10_000 };
    expect(geoapifySettings({})).toEqual(defaults);
    expect(geoapifySettings({ TILE_UPSTREAM_URL: "", TILE_STYLE: "", GEOAPIFY_API_KEY: "", TILES_BREAKER_MS: "" })).toEqual(defaults);
  });

  it("reads each variable", () => {
    const env = { TILE_UPSTREAM_URL: "http://tiles:2324/v1/tile", TILE_STYLE: "osm-bright", GEOAPIFY_API_KEY: KEY, TILES_BREAKER_MS: "0" };
    expect(geoapifySettings(env)).toEqual({ url: "http://tiles:2324/v1/tile", style: "osm-bright", key: KEY, breakerMs: 0 });
  });

  it.each([`${KEY}\n`, ` ${KEY}`, `\t${KEY}\r\n`])("reads GEOAPIFY_API_KEY=%j trimmed", (raw) => {
    expect(geoapifySettings({ GEOAPIFY_API_KEY: raw }).key).toBe(KEY);
  });

  it("reads a blank GEOAPIFY_API_KEY as no key", () => {
    expect(geoapifySettings({ GEOAPIFY_API_KEY: " \n " }).key).toBe("");
  });

  it.each(["abc", "10s", "1e4", "-1", " 5", "2.5"])("reads TILES_BREAKER_MS=%j as 10 s: digits only", (raw) => {
    expect(geoapifySettings({ TILES_BREAKER_MS: raw }).breakerMs).toBe(10_000);
  });

  it.each(["../positron", "dark/matter", "Positron", "positron?x=1", "klokantech basic"])(
    "reads TILE_STYLE=%j as positron: a setting cannot change the path",
    (raw) => {
      expect(geoapifySettings({ TILE_STYLE: raw }).style).toBe("positron");
    },
  );
});
