import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tile } from "@/domain/tile";
import { BLANK_TILE } from "./blank-tile";
import { handleTile } from "./handle";
import type { Ign, IgnAnswer } from "./ign";

const PARIS = { z: "14", x: "8299", y: "5636" };
const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

/** An IGN that answers `answer`, and records what it was asked. */
function ignAnswering(answer: IgnAnswer = { state: "tile", png: PNG }) {
  const tile = vi.fn(async (asked: Tile) => (void asked, answer));
  return { ign: { tile } satisfies Ign, tile };
}

const bytes = async (response: Response) => new Uint8Array(await response.arrayBuffer());
const headersOf = (response: Response) => Object.fromEntries(response.headers.entries());

const ONE_DAY = { "cache-control": "public, max-age=86400" };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a tile (CA3.2)", () => {
  it("answers 200 image/png, its bytes, a day in the browser and 30 days at the CDN", async () => {
    const { ign, tile } = ignAnswering();
    const response = await handleTile(PARIS, ign);
    expect(response.status).toBe(200);
    expect(headersOf(response)).toEqual({
      "content-type": "image/png",
      ...ONE_DAY,
      "cdn-cache-control": "public, s-maxage=2592000",
    });
    expect(await bytes(response)).toEqual(PNG);
    expect(tile.mock.calls).toEqual([[{ z: 14, x: 8299, y: 5636 }]]);
  });
});

describe("a missing tile (CA2.6, CA3.2)", () => {
  it("answers 200 with the blank tile, a day in the browser and at the CDN", async () => {
    const response = await handleTile(PARIS, ignAnswering({ state: "absent" }).ign);
    expect(response.status).toBe(200);
    expect(headersOf(response)).toEqual({
      "content-type": "image/png",
      ...ONE_DAY,
      "cdn-cache-control": "public, s-maxage=86400",
    });
    expect(await bytes(response)).toEqual(BLANK_TILE);
  });
});

describe("any other 404 (CA2.6)", () => {
  it("answers 200 with the blank tile, stored nowhere", async () => {
    const response = await handleTile(PARIS, ignAnswering({ state: "blank" }).ign);
    expect(response.status).toBe(200);
    expect(headersOf(response)).toEqual({ "content-type": "image/png", "cache-control": "no-store" });
    expect(await bytes(response)).toEqual(BLANK_TILE);
  });
});

describe("a failure (CA3.2)", () => {
  it("answers 502, empty, stored nowhere: the only answer that raises tileerror", async () => {
    const response = await handleTile(PARIS, ignAnswering({ state: "failed" }).ign);
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
  ])("answer 404, stored nowhere, without asking the IGN, for %s", async (_, params) => {
    const { ign, tile } = ignAnswering();
    const response = await handleTile(params, ign);
    expect(response.status).toBe(404);
    expect(headersOf(response)).toEqual({ "cache-control": "no-store" });
    expect(await response.text()).toBe("");
    expect(tile).not.toHaveBeenCalled();
  });
});

describe("the route", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("exports GET only: Next answers HEAD with it, OPTIONS with 204, any other method with 405", async () => {
    expect(Object.keys(await import("./route"))).toEqual(["GET"]);
  });

  it("sends the IGN nothing of the visitor's request: no cookie, Referer nor X-Forwarded-For", async () => {
    const fetch = vi.fn(async (url: string, init: RequestInit) => (void url, void init, new Response(null, { status: 503 })));
    vi.stubGlobal("fetch", fetch);
    const { GET } = await import("./route");
    const request = new Request("https://fullcar.example/tuiles/14/8299/5636?session=1", {
      headers: {
        cookie: "session=Claire",
        Referer: "https://fullcar.example/e/Ab3dEf7h",
        "X-Forwarded-For": "203.0.113.7",
        "Accept-Language": "fr",
      },
    });
    const response = await GET(request, { params: Promise.resolve(PARIS) });
    expect(response.status).toBe(502);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).not.toMatch(/session|Ab3dEf7h|203\.0\.113\.7/);
    expect([...new Headers(init.headers).keys()]).toEqual(["accept", "user-agent"]);
  });
});
