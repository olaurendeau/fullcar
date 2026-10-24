import type { APIResponse } from "@playwright/test";
import { BLANK_TILE } from "@/app/tuiles/[z]/[x]/[y]/blank-tile";
import { expect, test } from "./fixtures";
import { answerTiles, requestsForTile, type IgnAnswer } from "./ign";
import { PNG_SIGNATURE, tileOf } from "./tiles";

// #475: `GET /tuiles/{z}/{x}/{y}` (event-map v11, « Les tuiles », CA2.6, CA3.2) against the
// slot's fake IGN, through `next start`: what the IGN receives, and what the route answers to
// each of its answers. Each test sets only the tiles it asks for itself, around `placeOf` its
// own event (#238, « Capacité du faux IGN »): never an area.

type Coordinates = { z: number; x: number; y: number };

function coordinatesOf(tile: string): Coordinates {
  const [z, x, y] = tile.split("/").map(Number);
  return { z, x, y };
}

/** The route's answer as the browser receives it: its status, two headers and its body. */
async function read(response: APIResponse) {
  return {
    status: response.status(),
    type: response.headers()["content-type"],
    cache: response.headers()["cache-control"],
    cdn: response.headers()["cdn-cache-control"],
    body: await response.body(),
  };
}

function isPng(body: Buffer) {
  return body.subarray(0, 8).equals(PNG_SIGNATURE);
}

const failures: NonNullable<IgnAnswer["kind"]>[] = ["invalidParameter", "forbidden", "tooMany", "error"];

test.describe("GET /tuiles/{z}/{x}/{y} against the fake IGN", () => {
  test("answers 404 to coordinates that are not a tile, and asks the IGN nothing", async ({ request, seededEvent }) => {
    // Each path on a tile of its own, with the tile a route that misread it would ask the IGN for.
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
      expect.soft((await requestsForTile(tile)).length, path).toBe(0);
    }
  });

  test("asks for the layer's grid and style, and passes on nothing of the visitor", async ({ request, seededEvent }) => {
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
    const [{ query, headers }] = received;
    const parameters = new URLSearchParams(query);
    expect(parameters.get("TILEMATRIXSET")).toBe("PM_0_19");
    expect(parameters.get("STYLE")).toBe("normal");
    expect({
      cookie: headers.cookie !== undefined,
      referer: headers.referer !== undefined,
      forwardedFor: headers["x-forwarded-for"] !== undefined,
    }).toEqual({ cookie: false, referer: false, forwardedFor: false });
  });

  test("keeps a tile a day in the browser and 30 days at the CDN", async ({ request, seededEvent }) => {
    const answer = await read(await request.get(`/tuiles/${tileOf(seededEvent.id)}`));
    expect(answer.status).toBe(200);
    expect(answer.type).toBe("image/png");
    expect(answer.cache).toBe("public, max-age=86400");
    expect(answer.cdn).toBe("public, s-maxage=2592000");
    expect(isPng(answer.body)).toBe(true);
    // The IGN's tile, not the blank one.
    expect(answer.body.equals(Buffer.from(BLANK_TILE))).toBe(false);
  });

  test("answers the blank tile, a day in both caches, to the IGN's Not Found report", async ({ request, seededEvent }) => {
    const tile = tileOf(seededEvent.id);
    await answerTiles([tile], { kind: "notFound" });

    const answer = await read(await request.get(`/tuiles/${tile}`));
    expect(answer.status).toBe(200);
    expect(answer.type).toBe("image/png");
    expect(answer.cache).toBe("public, max-age=86400");
    expect(answer.cdn).toBe("public, s-maxage=86400");
    expect(answer.body.equals(Buffer.from(BLANK_TILE))).toBe(true);
    expect((await requestsForTile(tile)).length).toBe(1);
  });

  test("answers the blank tile, stored nowhere, to a 404 without that report", async ({ request, seededEvent }) => {
    const tile = tileOf(seededEvent.id);
    await answerTiles([tile], { kind: "notFoundBare" });

    const answer = await read(await request.get(`/tuiles/${tile}`));
    expect(answer.status).toBe(200);
    expect(answer.type).toBe("image/png");
    expect(answer.cache).toBe("no-store");
    expect(answer.cdn).toBeUndefined();
    expect(answer.body.equals(Buffer.from(BLANK_TILE))).toBe(true);
  });

  for (const kind of failures) {
    test(`answers 502, stored nowhere, to ${kind}`, async ({ request, seededEvent }) => {
      const tile = tileOf(seededEvent.id);
      await answerTiles([tile], { kind });

      const answer = await read(await request.get(`/tuiles/${tile}`));
      expect(answer.status).toBe(502);
      expect(answer.cache).toBe("no-store");
      expect(answer.cdn).toBeUndefined();
      expect((await requestsForTile(tile)).length).toBe(1);
    });
  }
});
