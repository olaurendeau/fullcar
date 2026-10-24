import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tile } from "@/domain/tile";
import type { Geoapify, TileAnswer } from "./geoapify";
import { handleTile } from "./handle";

const PARIS = { z: "14", x: "8299", y: "5636" };
const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
/** The slot's test key (compose.yaml): nothing else could be mistaken for it. */
const KEY = "fullcar-test-key-7f3a9c2e";

/** A Geoapify that answers `answer`, and records what it was asked. */
function geoapifyAnswering(answer: TileAnswer = { state: "tile", png: PNG }) {
  const tile = vi.fn(async (asked: Tile) => (void asked, answer));
  return { geoapify: { tile } satisfies Geoapify, tile };
}

const bytes = async (response: Response) => new Uint8Array(await response.arrayBuffer());
const headersOf = (response: Response) => Object.fromEntries(response.headers.entries());

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("a tile (CA3.2)", () => {
  it("answers 200 image/png, its bytes, a day in the browser and 30 days at the CDN", async () => {
    const { geoapify, tile } = geoapifyAnswering();
    const response = await handleTile(PARIS, geoapify);
    expect(response.status).toBe(200);
    expect(headersOf(response)).toEqual({
      "content-type": "image/png",
      "cache-control": "public, max-age=86400",
      "cdn-cache-control": "public, s-maxage=2592000",
    });
    expect(await bytes(response)).toEqual(PNG);
    expect(tile.mock.calls).toEqual([[{ z: 14, x: 8299, y: 5636 }]]);
  });
});

describe("everything else (CA2.6, CA3.2)", () => {
  it("answers 502, empty, stored nowhere: never a transparent PNG, and Leaflet's tileerror", async () => {
    const response = await handleTile(PARIS, geoapifyAnswering({ state: "failed" }).geoapify);
    expect(response.status).toBe(502);
    expect(headersOf(response)).toEqual({ "cache-control": "no-store" });
    expect(await response.text()).toBe("");
  });
});

describe("coordinates that are not a tile (CA3.2)", () => {
  it.each([
    ["a zoom past 18", { ...PARIS, z: "19" }],
    ["a column past the grid", { ...PARIS, x: "16384" }],
    ["a row past the grid", { ...PARIS, y: "16384" }],
    ["a leading zero", { ...PARIS, x: "08299" }],
    ["a word", { ...PARIS, y: "Lyon" }],
  ])("answer 404, stored nowhere, without asking Geoapify, for %s", async (_, params) => {
    const { geoapify, tile } = geoapifyAnswering();
    const response = await handleTile(params, geoapify);
    expect(response.status).toBe(404);
    expect(headersOf(response)).toEqual({ "cache-control": "no-store" });
    expect(await response.text()).toBe("");
    expect(tile).not.toHaveBeenCalled();
  });
});

describe("the route", () => {
  let errors: unknown[][];
  beforeEach(() => {
    errors = [];
    vi.spyOn(console, "error").mockImplementation((...args) => void errors.push(args));
    // The route reads its settings once, at its import: each test imports it anew.
    vi.resetModules();
  });

  /** The route's `GET`, its settings read from `env`, and the `fetch` it calls. */
  async function routeWith(env: Record<string, string>) {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    const fetch = vi.fn(async (url: string, init: RequestInit) => (void url, void init, new Response(null, { status: 503 })));
    vi.stubGlobal("fetch", fetch);
    const { GET } = await import("./route");
    const get = (request = new Request("https://fullcar.example/tuiles/14/8299/5636")) => GET(request, { params: Promise.resolve(PARIS) });
    return { get, fetch };
  }

  it("exports GET only: Next answers HEAD with it, OPTIONS with 204, any other method with 405", async () => {
    expect(Object.keys(await import("./route"))).toEqual(["GET"]);
  });

  it("asks Geoapify, and sends it nothing of the visitor's request: no cookie, Referer nor X-Forwarded-For", async () => {
    const { get, fetch } = await routeWith({ GEOAPIFY_API_KEY: KEY, TILE_UPSTREAM_URL: "", TILE_STYLE: "" });
    const request = new Request("https://fullcar.example/tuiles/14/8299/5636?session=1", {
      headers: {
        cookie: "session=Claire",
        Referer: "https://fullcar.example/e/Ab3dEf7h",
        "X-Forwarded-For": "203.0.113.7",
        "Accept-Language": "fr",
      },
    });
    const response = await get(request);
    expect(response.status).toBe(502);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`https://maps.geoapify.com/v1/tile/positron/14/8299/5636@2x.png?apiKey=${KEY}`);
    expect([...new Headers(init.headers).keys()]).toEqual(["accept", "user-agent"]);
  });

  it("sends the key trimmed: pasted with a final line break, it still works", async () => {
    const { get, fetch } = await routeWith({ GEOAPIFY_API_KEY: `${KEY}\n` });
    await get();
    expect(new URL(fetch.mock.calls[0][0]).search).toBe(`?apiKey=${KEY}`);
  });

  it.each([
    ["empty", ""],
    ["blank", " \r\n"],
  ])("answers 502, stored nowhere, without a call, and logs « tiles: no key » when the key is %s (CA3.5)", async (_, key) => {
    const { get, fetch } = await routeWith({ GEOAPIFY_API_KEY: key });
    const response = await get();
    expect(response.status).toBe(502);
    expect(headersOf(response)).toEqual({ "cache-control": "no-store" });
    expect(await response.text()).toBe("");
    expect(fetch).not.toHaveBeenCalled();
    expect(errors).toEqual([["tiles: no key"]]);
  });
});
