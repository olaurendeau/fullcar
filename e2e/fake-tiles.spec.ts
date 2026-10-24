import { expect, test } from "./fixtures";
import { answerTiles, PNG_SIGNATURE, requestsForTile, tileOf, type TileAnswer } from "./tiles";

// The fake tile provider itself, as the app will reach it: `TILE_UPSTREAM_URL` and
// `GEOAPIFY_API_KEY` of `web` (compose.yaml).
const TILE_UPSTREAM_URL = "http://tiles:2324/v1/tile";
const API_KEY = "fullcar-test-key-7f3a9c2e";

/** The URL the app asks for `tile`, `z/x/y`, in the style `positron`, @2x. */
function tileUrl(tile: string, apiKey: string | null = API_KEY) {
  const url = new URL(`${TILE_UPSTREAM_URL}/positron/${tile}@2x.png`);
  if (apiKey !== null) url.searchParams.set("apiKey", apiKey);
  return url;
}

function getTile(tile: string, headers: Record<string, string> = {}) {
  return fetch(tileUrl(tile), { headers });
}

/** A PNG of 512 × 512: its signature, then the width and height of its IHDR. */
function expectTilePng(body: Buffer) {
  expect(body.subarray(0, 8)).toEqual(PNG_SIGNATURE);
  expect(body.subarray(12, 16).toString("latin1")).toBe("IHDR");
  expect([body.readUInt32BE(16), body.readUInt32BE(20)]).toEqual([512, 512]);
}

async function expectTile(response: Response) {
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");
  expectTilePng(Buffer.from(await response.arrayBuffer()));
}

/** A control request as sent, to see the fake refuse what `answerTiles` would not send. */
function setRaw(body: string) {
  return fetch(new URL("/answers", process.env.TILES_CONTROL_URL), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

const statuses: [TileAnswer["kind"], number][] = [
  ["unauthorized", 401],
  ["forbidden", 403],
  ["notFound", 404],
  ["tooMany", 429],
  ["error", 500],
];

test.describe("the fake tile provider", () => {
  test("answers a grey PNG of 512 × 512 to a tile nobody set", async ({ seededEvent }) => {
    await expectTile(await getTile(tileOf(seededEvent.id)));
  });

  for (const [kind, status] of statuses) {
    test(`answers ${kind} (${status}) to the tile it is set for, and to it only`, async ({ seededEvent }) => {
      const tile = tileOf(seededEvent.id);
      const [z, x, y] = tile.split("/").map(Number);
      await answerTiles([tile], { kind });

      const response = await getTile(tile);
      expect(response.status).toBe(status);
      expect(response.headers.get("retry-after")).toBeNull();
      // The key never comes back in an answer.
      expect(await response.text()).not.toContain(API_KEY);
      // Neither the next column, nor the next row, nor the same x and y at another zoom.
      for (const other of [`${z}/${x + 1}/${y}`, `${z}/${x}/${y + 1}`, `${z + 1}/${x}/${y}`]) {
        await expectTile(await getTile(other));
      }
    });
  }

  test("answers tooMany with the Retry-After it is given, as is", async ({ seededEvent }) => {
    const values = ["30", "Wed, 21 Oct 2026 07:28:00 GMT", "soon"];
    for (const [dx, retryAfter] of values.entries()) {
      const tile = tileOf(seededEvent.id, dx);
      await answerTiles([tile], { kind: "tooMany", retryAfter });
      const response = await getTile(tile);
      expect(response.status, retryAfter).toBe(429);
      expect(response.headers.get("retry-after"), retryAfter).toBe(retryAfter);
    }
  });

  test("answers notPng with a 200 that is no PNG", async ({ seededEvent }) => {
    const tile = tileOf(seededEvent.id);
    await answerTiles([tile], { kind: "notPng" });
    const response = await getTile(tile);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    const body = Buffer.from(await response.arrayBuffer());
    expect(body.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(false);
  });

  test("answers each of the tiles given in one setting", async ({ seededEvent }) => {
    const tiles = [tileOf(seededEvent.id), tileOf(seededEvent.id, 1)];
    await answerTiles(tiles, { kind: "forbidden" });
    for (const tile of tiles) expect((await getTile(tile)).status, tile).toBe(403);
    await expectTile(await getTile(tileOf(seededEvent.id, 2)));
  });

  test("answers the tile again once set back to it", async ({ seededEvent }) => {
    const tile = tileOf(seededEvent.id);
    await answerTiles([tile], { kind: "tooMany", retryAfter: "30" });
    expect((await getTile(tile)).status).toBe(429);
    await answerTiles([tile], { kind: "tile" });
    const response = await getTile(tile);
    expect(response.headers.get("retry-after")).toBeNull();
    await expectTile(response);
  });

  test("answers 401 to a request without apiKey, whatever the tile is set to", async ({ seededEvent }) => {
    const plain = tileOf(seededEvent.id);
    const slow = tileOf(seededEvent.id, 1);
    await answerTiles([slow], { kind: "notPng", delayMs: 1500 });
    for (const tile of [plain, slow]) {
      for (const url of [tileUrl(tile, null), tileUrl(tile, "")]) {
        const started = Date.now();
        const response = await fetch(url);
        expect(response.status, url.href).toBe(401);
        expect(response.headers.get("content-type"), url.href).toBe("application/json; charset=utf-8");
        expect(Date.now() - started, url.href).toBeLessThan(1000);
      }
    }
  });

  test("answers 400 to a request it cannot read", async ({ seededEvent }) => {
    const tile = tileOf(seededEvent.id);
    const [z, x, y] = tile.split("/");
    const unreadable: [string, string][] = [
      ["no style", `/v1/tile/${tile}@2x.png`],
      ["an x with a leading zero", `/v1/tile/positron/${z}/0${x}/${y}@2x.png`],
      ["a z that is no integer", `/v1/tile/positron/${z}.0/${x}/${y}@2x.png`],
      ["no @2x", `/v1/tile/positron/${tile}.png`],
      ["another format", `/v1/tile/positron/${tile}@2x.jpg`],
      ["another path", `/v1/staticmap/positron/${tile}@2x.png`],
      ["no tile", "/"],
    ];
    for (const [label, path] of unreadable) {
      const url = new URL(path, TILE_UPSTREAM_URL);
      url.searchParams.set("apiKey", API_KEY);
      const response = await fetch(url);
      expect(response.status, label).toBe(400);
      expect(await response.text(), label).not.toContain(API_KEY);
    }
    expect((await fetch(tileUrl(tile), { method: "POST" })).status).toBe(400);
    // Nothing it could not read was recorded for the tile.
    expect(await requestsForTile(tile)).toEqual([]);
  });

  test("answers after the delay set for a tile, whatever the answer, and the others at once", async ({
    seededEvent,
  }) => {
    const slowError = tileOf(seededEvent.id);
    const slowTile = tileOf(seededEvent.id, 1);
    await answerTiles([slowError], { kind: "error", delayMs: 1500 });
    await answerTiles([slowTile], { delayMs: 1500 });

    for (const [tile, status] of [
      [slowError, 500],
      [slowTile, 200],
    ] as const) {
      const started = Date.now();
      const response = await getTile(tile);
      await response.arrayBuffer();
      const elapsed = Date.now() - started;
      expect(response.status, tile).toBe(status);
      expect(elapsed, tile).toBeGreaterThanOrEqual(1500);
      expect(elapsed, tile).toBeLessThan(3000);
    }

    const other = Date.now();
    await expectTile(await getTile(tileOf(seededEvent.id, 2)));
    expect(Date.now() - other).toBeLessThan(1000);
  });

  test("records each request for a tile: its path, its query and its headers", async ({ seededEvent }) => {
    const tile = tileOf(seededEvent.id);
    expect((await requestsForTile(tile)).length).toBe(0);

    await getTile(tile, { "User-Agent": "fullcar/0.0.0 (+https://github.com/olaurendeau/fullcar)", Accept: "image/png" });
    await getTile(tile, { "X-Second": "yes" });
    await fetch(tileUrl(tile, null));
    await getTile(tileOf(seededEvent.id, 1));

    const requests = await requestsForTile(tile);
    expect(requests.length).toBe(3);
    const [first, second, withoutKey] = requests;
    expect(first.path).toBe(`/v1/tile/positron/${tile}@2x.png`);
    // As sent, not decoded: the key the app sends, and nothing else, is what a test will check.
    expect(first.query).toBe(`apiKey=${API_KEY}`);
    expect(first.headers["user-agent"]).toBe("fullcar/0.0.0 (+https://github.com/olaurendeau/fullcar)");
    expect(first.headers.accept).toBe("image/png");
    expect(first.headers["x-second"]).toBeUndefined();
    expect(second.headers["x-second"]).toBe("yes");
    // A request the fake refused for want of a key is recorded too.
    expect(withoutKey.query).toBe("");
  });

  test("records a request that is still waiting for its delay", async ({ seededEvent }) => {
    const tile = tileOf(seededEvent.id);
    await answerTiles([tile], { delayMs: 1500 });
    const pending = getTile(tile);
    await expect.poll(async () => (await requestsForTile(tile)).length, { timeout: 1000 }).toBe(1);
    await pending;
  });

  test("refuses a delay longer than a timer holds, which Node would cut to 1 ms", async ({ seededEvent }) => {
    const tile = tileOf(seededEvent.id);
    await expect(answerTiles([tile], { kind: "error", delayMs: 2 ** 31 })).rejects.toThrow("(400)");

    // Nothing was set: the tile is answered at once, a PNG.
    const started = Date.now();
    await expectTile(await getTile(tile));
    expect(Date.now() - started).toBeLessThan(1000);
    // The longest a timer holds is still accepted.
    await answerTiles([tileOf(seededEvent.id, 1)], { delayMs: 2 ** 31 - 1 });
  });

  test("refuses a malformed setting", async ({ seededEvent }) => {
    const tile = tileOf(seededEvent.id);
    const malformed: unknown[] = [
      { tiles: [], answer: { kind: "notFound" } },
      { tiles: tile, answer: { kind: "notFound" } },
      { tiles: ["14/8299"], answer: { kind: "notFound" } },
      { tiles: ["14/08299/5636"], answer: { kind: "notFound" } },
      { tiles: [tile], answer: { kind: "invalidParameter" } },
      { tiles: [tile], answer: { delayMs: -1 } },
      { tiles: [tile], answer: { delayMs: "1500" } },
      { tiles: [tile], answer: { kind: "tooMany", retryAfter: 30 } },
      { tiles: [tile], answer: { kind: "tooMany", retryAfter: "" } },
      { tiles: [tile], answer: { kind: "tooMany", retryAfter: "30\r\nSet-Cookie: a=b" } },
      { tiles: [tile], answer: { kind: "error", retryAfter: "30" } },
      { tiles: [tile], answer: { retryAfter: "30" } },
      { tiles: [tile] },
    ];
    for (const body of malformed) {
      expect((await setRaw(JSON.stringify(body))).status, JSON.stringify(body)).toBe(400);
    }
    expect((await setRaw("not json")).status).toBe(400);
    await expect(answerTiles([tile], { kind: "unknown" as TileAnswer["kind"] })).rejects.toThrow();
    // Nothing was set by a refused setting.
    await expectTile(await getTile(tile));
  });
});
