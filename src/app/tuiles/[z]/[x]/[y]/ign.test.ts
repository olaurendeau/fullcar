import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { wmtsTileUrl, type Tile } from "@/domain/tile";
import { createIgn, ignSettings, type IgnAnswer } from "./ign";

const IGN = "https://data.geopf.fr/wmts";
const PARIS: Tile = { z: 14, x: 8299, y: 5636 };

/** The body the real service answered for any missing tile (survey of #473, on #238), as it is. */
const NOT_FOUND =
  '<ExceptionReport xmlns="http://www.opengis.net/ows/1.1"><Exception exceptionCode="Not Found" >No data found</Exception></ExceptionReport>';
/** What it answered for an unknown layer. */
const INVALID_PARAMETER =
  '<ExceptionReport xmlns="http://www.opengis.net/ows/1.1"><Exception exceptionCode="InvalidParameterValue" >Layer unknown</Exception></ExceptionReport>';

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
/** A tile: the PNG signature, then whatever follows, `bytes` long in all. */
const pngBytes = (bytes = 64) => Uint8Array.from({ length: bytes }, (_, i) => SIGNATURE[i] ?? i % 251);
const png = (bytes?: number, type = "image/png") => new Response(pngBytes(bytes), { headers: { "Content-Type": type } });
const status = (code: number, body: BodyInit | null = INVALID_PARAMETER) => new Response(body, { status: code });
/** The text in Latin-1, one byte per character: « é » is 0xE9, which UTF-8 cannot read alone. */
const latin1 = (text: string) => Uint8Array.from(text, (character) => character.charCodeAt(0));

const TILE_LIMIT = 524_288;
const REPORT_LIMIT = 4_096;

type Answer = (url: string, init: RequestInit) => Response | Promise<Response>;

/** The IGN behind an injected `fetch` that answers `answer`. */
function setup(answer: Answer = () => png()) {
  const fetch = vi.fn((url: string, init: RequestInit) => Promise.resolve(answer(url, init)));
  const ign = createIgn({ fetch: fetch as unknown as typeof globalThis.fetch, url: IGN });
  return { tile: (tile: Tile = PARIS) => ign.tile(tile), fetch };
}

const state = (answer: IgnAnswer) => answer.state;

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
  it("asks wmtsTileUrl's URL: Plan IGN v2, grid PM_0_19, style normal", async () => {
    const { tile, fetch } = setup();
    await tile();
    expect(fetch).toHaveBeenCalledTimes(1);
    const url = fetch.mock.calls[0][0];
    expect(url).toBe(wmtsTileUrl(IGN, PARIS));
    expect(url).toContain("TILEMATRIXSET=PM_0_19");
    expect(url).toContain("STYLE=normal");
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

  it("is kept out of Next's data cache: the CDN's is the cache", async () => {
    const { tile, fetch } = setup();
    await tile();
    expect(fetch.mock.calls[0][1].cache).toBe("no-store");
  });

  it("follows no redirect", async () => {
    const { tile, fetch } = setup();
    await tile();
    expect(fetch.mock.calls[0][1].redirect).toBe("error");
  });
});

describe("a tile", () => {
  it("is a 200 image/png, its bytes as they came", async () => {
    const answer = await setup().tile();
    expect(answer).toEqual({ state: "tile", png: pngBytes() });
  });

  it("reads the media type in any case, with parameters", async () => {
    expect(state(await setup(() => png(64, "Image/PNG; charset=binary")).tile())).toBe("tile");
  });

  it("reads a tile of 512 KiB", async () => {
    expect(state(await setup(() => png(TILE_LIMIT)).tile())).toBe("tile");
  });
});

describe("a missing tile: a 404 with the Not Found report (CA2.6)", () => {
  it("is absent with the survey's body", async () => {
    expect(await setup(() => status(404, NOT_FOUND)).tile()).toEqual({ state: "absent" });
  });

  it("is absent with a report of 4 096 bytes", async () => {
    const padded = NOT_FOUND + " ".repeat(REPORT_LIMIT - NOT_FOUND.length);
    expect(state(await setup(() => status(404, padded)).tile())).toBe("absent");
  });
});

describe("any other 404 (CA2.6)", () => {
  /** An endless body, which counts what was pulled of it. */
  const endless = () => {
    const pulls = { count: 0 };
    const body = new ReadableStream({
      pull(controller) {
        pulls.count++;
        controller.enqueue(new TextEncoder().encode(" ".repeat(1024)));
      },
    });
    return { pulls, body };
  };

  it.each([
    ["without a body", null],
    ["without a report", "<html><body>Not Found</body></html>"],
    ["with a report of another exceptionCode", INVALID_PARAMETER],
    ["with Not Found in the text only", NOT_FOUND.replace('exceptionCode="Not Found"', 'exceptionCode="NoApplicableCode"')],
    ["with a report beyond 4 096 bytes", NOT_FOUND + " ".repeat(REPORT_LIMIT - NOT_FOUND.length + 1)],
    // Decoded leniently, the byte would become U+FFFD in the text, and the report a valid one.
    ["with a body that is not UTF-8", latin1(NOT_FOUND.replace("No data found", "No data found é"))],
  ])("is blank %s", async (_, body) => {
    expect(await setup(() => status(404, body)).tile()).toEqual({ state: "blank" });
  });

  it("is blank with a body that breaks while it is read", async () => {
    const broken = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(NOT_FOUND.slice(0, 20)));
        controller.error(new TypeError("terminated"));
      },
    });
    expect(state(await setup(() => status(404, broken)).tile())).toBe("blank");
  });

  it("stops reading a body beyond 4 096 bytes", async () => {
    const { pulls, body } = endless();
    expect(state(await setup(() => status(404, body)).tile())).toBe("blank");
    expect(pulls.count).toBeLessThan(10);
  });
});

describe("a failure (CA3.2)", () => {
  it.each([
    ["a 400 InvalidParameterValue", () => status(400, INVALID_PARAMETER)],
    ["another 400", () => status(400, "Bad Request")],
    ["a 400 with the Not Found report", () => status(400, NOT_FOUND)],
    ["a 403", () => status(403)],
    ["a 429", () => status(429)],
    ["a 500", () => status(500)],
    ["a 503", () => status(503)],
    ["a 204", () => status(204, null)],
    ["a 200 that is not image/png", () => png(64, "text/html")],
    ["a 200 without a media type", () => new Response(new Blob([pngBytes()]))],
    ["a 200 image/png that is not a PNG", () => new Response("<html>", { headers: { "Content-Type": "image/png" } })],
    ["a 200 image/png beyond 512 KiB", () => png(TILE_LIMIT + 1)],
    ["a refused connection", () => Promise.reject(new TypeError("fetch failed"))],
    ["a redirect, which fetch refuses", () => Promise.reject(new TypeError("unexpected redirect"))],
  ])("is %s", async (_, answer) => {
    expect(await setup(answer).tile()).toEqual({ state: "failed" });
  });

  it("is a fetch that throws, never thrown further", async () => {
    const throwing = () => {
      throw new TypeError(`Failed to parse URL from ${wmtsTileUrl(IGN, PARIS)}`);
    };
    await expect(setup(throwing).tile()).resolves.toEqual({ state: "failed" });
  });

  it("is a tile whose body breaks while it is read", async () => {
    const broken = new ReadableStream({
      start(controller) {
        controller.enqueue(Uint8Array.from(SIGNATURE));
        controller.error(new TypeError("terminated"));
      },
    });
    const answer = () => new Response(broken, { headers: { "Content-Type": "image/png" } });
    expect(state(await setup(answer).tile())).toBe("failed");
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

/** Headers, then the first bytes of a body, then nothing more. */
const stalled = (code: number, first: Uint8Array) => () =>
  new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(first);
      },
    }),
    { status: code, headers: { "Content-Type": "image/png" } },
  );

describe("the delay of 5 s (CA3.2)", () => {
  beforeEach(() => void vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));

  it("keeps an answer that comes within 5 s", async () => {
    const pending = setup(after(4_999, () => png())).tile();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(state(await pending)).toBe("tile");
  });

  it("fails after 5 s without an answer", async () => {
    let settled = false;
    const pending = setup(after(60_000, () => png()))
      .tile()
      .finally(() => (settled = true));
    await vi.advanceTimersByTimeAsync(4_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ state: "failed" });
  });

  it.each([
    ["a tile", 200, Uint8Array.from(SIGNATURE)],
    ["a 404", 404, new TextEncoder().encode(NOT_FOUND.slice(0, 20))],
  ])("counts the body of %s in the 5 s", async (_, code, first) => {
    const pending = setup(stalled(code, first)).tile();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await pending).toEqual({ state: "failed" });
  });
});

describe("what the IGN's answer leaves in the logs", () => {
  const url = wmtsTileUrl(IGN, PARIS);

  it("logs nothing for a tile, nor for a missing tile: abroad, it is the normal case", async () => {
    await setup().tile();
    await setup(() => status(404, NOT_FOUND)).tile();
    expect(logs).toEqual([]);
  });

  it.each([
    ["a 404 without the report", () => status(404, "Not Found"), "ign: blank tile (HTTP 404 without a Not Found report)"],
    ["a 400", () => status(400), "ign: tile failed (HTTP 400)"],
    ["a 403", () => status(403), "ign: tile failed (HTTP 403)"],
    ["a 429", () => status(429), "ign: tile failed (HTTP 429)"],
    ["a 503", () => status(503), "ign: tile failed (HTTP 503)"],
    ["a 200 that is not a PNG", () => png(64, "text/html"), "ign: tile failed (not a PNG)"],
    ["a tile too large", () => png(TILE_LIMIT + 1), "ign: tile failed (answer too large)"],
    ["a refused connection", () => Promise.reject(new TypeError(`fetch failed: ${url}`)), "ign: tile failed (no answer)"],
  ])("logs a fixed line and the status for %s, never the tile nor the URL", async (_, answer, line) => {
    await setup(answer).tile();
    expect(logs).toEqual([[line]]);
    expect(JSON.stringify(logs)).not.toMatch(/8299|5636|geopf/);
  });

  it("logs the delay as such", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = setup(after(60_000, () => png())).tile();
    await vi.advanceTimersByTimeAsync(5_000);
    await pending;
    expect(logs).toEqual([["ign: tile failed (timeout)"]]);
  });
});

describe("ignSettings", () => {
  it("defaults to the Géoplateforme's public WMTS", () => {
    expect(ignSettings({})).toEqual({ url: IGN });
    expect(ignSettings({ IGN_WMTS_URL: "" })).toEqual({ url: IGN });
  });

  it("reads IGN_WMTS_URL", () => {
    expect(ignSettings({ IGN_WMTS_URL: "http://ign:2324/wmts" })).toEqual({ url: "http://ign:2324/wmts" });
  });
});
