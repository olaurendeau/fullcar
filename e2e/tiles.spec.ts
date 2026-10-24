import type { APIResponse } from "@playwright/test";
import { expect, test } from "./fixtures";
import { answerTiles, PNG_SIGNATURE, requestsForTile, tileAt, tileOf, type TileAnswer } from "./tiles";

// #554: `GET /tuiles/{z}/{x}/{y}` (event-map v27, « Les tuiles », CA2.6, CA3.2) against the
// slot's fake tile provider, through `next start`: what it receives, and what the route answers
// to each of its answers. Each test sets only the tiles it asks for itself, around `placeOf`
// its own event (#238, « Capacité du faux IGN »): never an area.

/** `web`'s key (compose.yaml): the only query the fake may receive. */
const API_KEY = "fullcar-test-key-7f3a9c2e";
/** fullcar's User-Agent, its version that of package.json. */
const USER_AGENT = /^fullcar\/\d+\.\d+\.\d+\S* \(\+https:\/\/github\.com\/olaurendeau\/fullcar\)$/;
/** Courmayeur, past the French border: a tile like any other (CA2.6). */
const COURMAYEUR = { lat: 45.79, lng: 6.97 };

type Coordinates = { z: number; x: number; y: number };

function coordinatesOf(tile: string): Coordinates {
  const [z, x, y] = tile.split("/").map(Number);
  return { z, x, y };
}

/** The route's answer as the browser receives it: its status, three headers and its body. */
async function read(response: APIResponse) {
  return {
    status: response.status(),
    type: response.headers()["content-type"],
    cache: response.headers()["cache-control"],
    cdn: response.headers()["cdn-cache-control"],
    body: await response.body(),
  };
}

/** The fake's tile, a PNG of 512 × 512: its signature, then the width and height of its IHDR. */
function isFakeTile(body: Buffer) {
  return body.subarray(0, 8).equals(PNG_SIGNATURE) && body.readUInt32BE(16) === 512 && body.readUInt32BE(20) === 512;
}

/** Everything the fake answers that is not a tile (CA2.6): each a 502 at our route. */
const failures: [name: string, answer: TileAnswer][] = [
  ["a 401", { kind: "unauthorized" }],
  ["a 403", { kind: "forbidden" }],
  ["a 404", { kind: "notFound" }],
  ["a 429", { kind: "tooMany" }],
  ["a 429 with Retry-After", { kind: "tooMany", retryAfter: "120" }],
  ["a 500", { kind: "error" }],
  ["a 200 that is not a PNG", { kind: "notPng" }],
  ["a tile slower than 5 s", { kind: "tile", delayMs: 6_000 }],
];

test.describe("GET /tuiles/{z}/{x}/{y} against the fake tile provider", () => {
  test("answers 404, stored nowhere, to coordinates that are not a tile, and asks the fake nothing", async ({ request, seededEvent }) => {
    // Each path on a tile of its own, with the tile a route that misread it would ask the fake for.
    const size = 2 ** 18;
    const misread: ((tile: Coordinates) => [path: string, asked: string])[] = [
      ({ z, x, y }) => [`/tuiles/0${z}/${x}/${y}`, `${z}/${x}/${y}`],
      ({ z, x, y }) => [`/tuiles/${z}/+${x}/${y}`, `${z}/${x}/${y}`],
      ({ z, x, y }) => [`/tuiles/${z}/${x}/${y}.png`, `${z}/${x}/${y}`],
      ({ z, x, y }) => [`/tuiles/${z + 1}/${2 * x}/${2 * y}`, `${z + 1}/${2 * x}/${2 * y}`],
      ({ z, x, y }) => [`/tuiles/${z}/${x + size}/${y}`, `${z}/${x + size}/${y}`],
      ({ z, x, y }) => [`/tuiles/${z}/${x}/${y + size}`, `${z}/${x}/${y + size}`],
    ];
    const cases = misread.map((pathOf, dx) => pathOf(coordinatesOf(tileOf(seededEvent.id, dx))));

    // Soft: one run reports each path a mutant lets through, not only the first.
    for (const [path, tile] of cases) {
      const response = await request.get(path);
      expect.soft(response.status(), path).toBe(404);
      expect.soft(response.headers()["cache-control"], path).toBe("no-store");
      expect.soft((await requestsForTile(tile)).length, path).toBe(0);
    }
  });

  test("asks for the style's tile @2x with the key as its only query, our User-Agent, and nothing of the visitor", async ({ request, seededEvent }) => {
    const tile = tileOf(seededEvent.id);
    const response = await request.get(`/tuiles/${tile}`, {
      headers: {
        Cookie: "fullcar=visitor",
        Referer: `http://web:3000/e/${seededEvent.id}`,
        "X-Forwarded-For": "203.0.113.7",
      },
    });
    expect(response.status()).toBe(200);

    const received = await requestsForTile(tile);
    expect(received.length).toBe(1);
    const [{ path, query, headers }] = received;
    expect(path).toBe(`/v1/tile/positron/${tile}@2x.png`);
    expect(query).toBe(`apiKey=${API_KEY}`);
    expect(headers["user-agent"]).toMatch(USER_AGENT);
    expect({
      cookie: headers.cookie !== undefined,
      referer: headers.referer !== undefined,
      forwardedFor: headers["x-forwarded-for"] !== undefined,
      visitorIp: JSON.stringify(headers).includes("203.0.113.7"),
    }).toEqual({ cookie: false, referer: false, forwardedFor: false, visitorIp: false });
  });

  test("keeps a tile a day in the browser and 30 days at the CDN", async ({ request, seededEvent }) => {
    const answer = await read(await request.get(`/tuiles/${tileOf(seededEvent.id)}`));
    expect(answer.status).toBe(200);
    expect(answer.type).toBe("image/png");
    expect(answer.cache).toBe("public, max-age=86400");
    expect(answer.cdn).toBe("public, s-maxage=2592000");
    expect(isFakeTile(answer.body)).toBe(true);
  });

  test("answers a tile in Courmayeur, out of France, like any other (CA2.6)", async ({ request }) => {
    const tile = tileAt(COURMAYEUR, 18);
    const answer = await read(await request.get(`/tuiles/${tile}`));
    expect(answer.status).toBe(200);
    expect(answer.cdn).toBe("public, s-maxage=2592000");
    expect(isFakeTile(answer.body)).toBe(true);
    expect((await requestsForTile(tile)).at(-1)?.path).toBe(`/v1/tile/positron/${tile}@2x.png`);
  });

  for (const [name, answer] of failures) {
    test(`answers 502, empty, stored nowhere, to ${name}`, async ({ request, seededEvent }) => {
      const tile = tileOf(seededEvent.id);
      await answerTiles([tile], answer);

      const response = await read(await request.get(`/tuiles/${tile}`));
      expect(response.status).toBe(502);
      expect(response.cache).toBe("no-store");
      expect(response.cdn).toBeUndefined();
      expect(response.body.length).toBe(0);
      expect((await requestsForTile(tile)).length).toBe(1);
    });
  }

  test("asks again right after a 429: the slot's breaker never opens (TILES_BREAKER_MS=0)", async ({ request, seededEvent }) => {
    const [limited, next] = [tileOf(seededEvent.id), tileOf(seededEvent.id, 1)];
    await answerTiles([limited], { kind: "tooMany", retryAfter: "3600" });
    expect((await request.get(`/tuiles/${limited}`)).status()).toBe(502);
    expect((await request.get(`/tuiles/${next}`)).status()).toBe(200);
    expect((await requestsForTile(next)).length).toBe(1);
  });
});
