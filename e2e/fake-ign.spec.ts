import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";
import { isPublicId, PUBLIC_ID_ALPHABET } from "@/domain/public-id-format";
import { answerTiles, placeOf, requestsForTile, tileAt, type IgnAnswer } from "./ign";

// The fake IGN itself, as the app will reach it: `IGN_WMTS_URL` of `web` (compose.yaml).
const IGN_WMTS_URL = "http://ign:2324/wmts";

/** The real service's 404 body, as captured from it (relevé de #473, #238). */
const NOT_FOUND_BODY =
  '<ExceptionReport xmlns="http://www.opengis.net/ows/1.1"><Exception exceptionCode="Not Found" >No data found</Exception></ExceptionReport>';

/**
 * This test's own tile: the fake keeps its answers and requests for its whole life. At z 18,
 * 256 times the tiles of z 14: the fake's tests need no map view, only tiles of their own.
 */
function tileOf(eventId: string, dx = 0) {
  const [z, x, y] = tileAt(placeOf(eventId), 18).split("/").map(Number);
  return `${z}/${x + dx}/${y}`;
}

/** The KVP `GetTile` the app sends for `tile`, `z/x/y` (Conception, § 2). */
function getTileUrl(tile: string) {
  const [z, x, y] = tile.split("/");
  const url = new URL(IGN_WMTS_URL);
  for (const [name, value] of Object.entries({
    SERVICE: "WMTS",
    VERSION: "1.0.0",
    REQUEST: "GetTile",
    LAYER: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2",
    STYLE: "normal",
    TILEMATRIXSET: "PM_0_19",
    FORMAT: "image/png",
    TILEMATRIX: z,
    TILEROW: y,
    TILECOL: x,
  })) {
    url.searchParams.set(name, value);
  }
  return url;
}

function getTile(tile: string, headers: Record<string, string> = {}) {
  return fetch(getTileUrl(tile), { headers });
}

/** A PNG of 256 × 256: its signature, then the width and height of its IHDR. */
function expectTilePng(body: Buffer) {
  expect(body.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  expect(body.subarray(12, 16).toString("latin1")).toBe("IHDR");
  expect([body.readUInt32BE(16), body.readUInt32BE(20)]).toEqual([256, 256]);
}

async function expectTile(response: Response) {
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");
  expectTilePng(Buffer.from(await response.arrayBuffer()));
}

/** A control request as sent, to see the fake refuse what `answerTiles` would not send. */
function setRaw(body: string) {
  return fetch(new URL("/answers", process.env.IGN_CONTROL_URL), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

const statuses: [IgnAnswer["kind"], number][] = [
  ["notFound", 404],
  ["notFoundBare", 404],
  ["invalidParameter", 400],
  ["forbidden", 403],
  ["tooMany", 429],
  ["error", 500],
];

test.describe("the fake IGN", () => {
  test("answers a small PNG tile to a tile nobody set", async ({ seededEvent }) => {
    await expectTile(await getTile(tileOf(seededEvent.id)));
  });

  for (const [kind, status] of statuses) {
    test(`answers ${kind} (${status}) to the tile it is set for, and to it only`, async ({ seededEvent }) => {
      const tile = tileOf(seededEvent.id);
      const [z, x, y] = tile.split("/").map(Number);
      await answerTiles([tile], { kind });

      expect((await getTile(tile)).status).toBe(status);
      // Neither the next column, nor the next row, nor the same x and y at another zoom.
      for (const other of [`${z}/${x + 1}/${y}`, `${z}/${x}/${y + 1}`, `${z + 1}/${x}/${y}`]) {
        await expectTile(await getTile(other));
      }
    });
  }

  test("answers each of the tiles given in one setting", async ({ seededEvent }) => {
    const tiles = [tileOf(seededEvent.id), tileOf(seededEvent.id, 1)];
    await answerTiles(tiles, { kind: "forbidden" });
    for (const tile of tiles) expect((await getTile(tile)).status, tile).toBe(403);
    await expectTile(await getTile(tileOf(seededEvent.id, 2)));
  });

  test("answers notFound with the real service's report, byte for byte", async ({ seededEvent }) => {
    const captured = await readFile(new URL("./ign-not-found.xml", import.meta.url));
    // The capture is the real body: no XML prologue, no final line break.
    expect(captured.toString("utf8")).toBe(NOT_FOUND_BODY);

    const tile = tileOf(seededEvent.id);
    await answerTiles([tile], { kind: "notFound" });
    const response = await getTile(tile);
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("text/xml; charset=UTF-8");
    expect(Buffer.from(await response.arrayBuffer()).equals(captured)).toBe(true);
  });

  test("answers notFoundBare with a 404 that is no OWS report", async ({ seededEvent }) => {
    const tile = tileOf(seededEvent.id);
    await answerTiles([tile], { kind: "notFoundBare" });
    const response = await getTile(tile);
    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).not.toContain("http://www.opengis.net/ows");
    expect(body).not.toContain("Exception");
  });

  test("answers invalidParameter with an InvalidParameterValue report", async ({ seededEvent }) => {
    const tile = tileOf(seededEvent.id);
    await answerTiles([tile], { kind: "invalidParameter" });
    const response = await getTile(tile);
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toBe("text/xml; charset=UTF-8");
    const body = await response.text();
    expect(body).toContain('<ExceptionReport xmlns="http://www.opengis.net/ows/1.1">');
    expect(body).toContain('exceptionCode="InvalidParameterValue"');
  });

  test("answers the tile again once set back to it", async ({ seededEvent }) => {
    const tile = tileOf(seededEvent.id);
    await answerTiles([tile], { kind: "error" });
    expect((await getTile(tile)).status).toBe(500);
    await answerTiles([tile], { kind: "tile" });
    await expectTile(await getTile(tile));
  });

  test("answers a request it cannot read with an InvalidParameterValue report", async ({ seededEvent }) => {
    const tile = tileOf(seededEvent.id);
    const unreadable: [string, (url: URL) => void][] = [
      ["no TILEROW", (url) => url.searchParams.delete("TILEROW")],
      ["a TILECOL with a leading zero", (url) => url.searchParams.set("TILECOL", `0${url.searchParams.get("TILECOL")}`)],
      ["a TILEMATRIX that is no integer", (url) => url.searchParams.set("TILEMATRIX", "14.0")],
      ["another request", (url) => url.searchParams.set("REQUEST", "GetCapabilities")],
      ["another path", (url) => (url.pathname = "/wms")],
    ];
    for (const [label, change] of unreadable) {
      const url = getTileUrl(tile);
      change(url);
      const response = await fetch(url);
      expect(response.status, label).toBe(400);
      expect(await response.text(), label).toContain('exceptionCode="InvalidParameterValue"');
    }
    const post = await fetch(getTileUrl(tile), { method: "POST" });
    expect(post.status).toBe(400);
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
    expect(await requestsForTile(tile)).toEqual([]);

    await getTile(tile, { "User-Agent": "fullcar/0.0.0 (+https://github.com/olaurendeau/fullcar)", Accept: "image/png" });
    await getTile(tile, { "X-Second": "yes" });
    await getTile(tileOf(seededEvent.id, 1));

    const requests = await requestsForTile(tile);
    expect(requests).toHaveLength(2);
    const [first, second] = requests;
    expect(first.path).toBe("/wmts");
    // As sent, not decoded: the app's grid and style are what a test will check.
    expect(first.query).toBe(getTileUrl(tile).search.slice(1));
    expect(first.query).toContain("TILEMATRIXSET=PM_0_19");
    expect(first.query).toContain("STYLE=normal");
    expect(first.headers["user-agent"]).toBe("fullcar/0.0.0 (+https://github.com/olaurendeau/fullcar)");
    expect(first.headers.accept).toBe("image/png");
    expect(first.headers["x-second"]).toBeUndefined();
    expect(second.headers["x-second"]).toBe("yes");
  });

  test("records a request that is still waiting for its delay", async ({ seededEvent }) => {
    const tile = tileOf(seededEvent.id);
    await answerTiles([tile], { delayMs: 1500 });
    const pending = getTile(tile);
    await expect.poll(async () => (await requestsForTile(tile)).length, { timeout: 1000 }).toBe(1);
    await pending;
  });

  test("refuses a malformed setting", async ({ seededEvent }) => {
    const tile = tileOf(seededEvent.id);
    const malformed: unknown[] = [
      { tiles: [], answer: { kind: "notFound" } },
      { tiles: tile, answer: { kind: "notFound" } },
      { tiles: ["14/8299"], answer: { kind: "notFound" } },
      { tiles: ["14/08299/5636"], answer: { kind: "notFound" } },
      { tiles: [tile], answer: { kind: "TileOutOfRange" } },
      { tiles: [tile], answer: { delayMs: -1 } },
      { tiles: [tile], answer: { delayMs: "1500" } },
      { tiles: [tile] },
    ];
    for (const body of malformed) {
      expect((await setRaw(JSON.stringify(body))).status, JSON.stringify(body)).toBe(400);
    }
    expect((await setRaw("not json")).status).toBe(400);
    await expect(answerTiles([tile], { kind: "unknown" as IgnAnswer["kind"] })).rejects.toThrow();
    // Nothing was set by a refused setting.
    await expectTile(await getTile(tile));
  });
});

test.describe("the tiles of a test", () => {
  test("tileAt follows Leaflet's grid", () => {
    expect(tileAt({ lat: 48.8566, lng: 2.3522 }, 0)).toBe("0/0/0");
    // The tiles of the relevé de #473: Paris, Lucerne and Rome at z 14.
    expect(tileAt({ lat: 48.8566, lng: 2.3522 }, 14)).toBe("14/8299/5636");
    expect(tileAt({ lat: 47.0502, lng: 8.3093 }, 14)).toBe("14/8570/5759");
    expect(tileAt({ lat: 41.9028, lng: 12.4964 }, 14)).toBe("14/8760/6087");
    // The grid's edges stay in the grid.
    expect(tileAt({ lat: 89, lng: 180 }, 2)).toBe("2/3/0");
    expect(tileAt({ lat: -89, lng: -180 }, 2)).toBe("2/0/3");
  });

  test("placeOf stays in France, the same place for the same event", () => {
    const ids = publicIds(4000);
    expect(ids.every(isPublicId)).toBe(true);
    const outside = ids.filter((id) => {
      const { lat, lng } = placeOf(id);
      return !(lat >= 43.6 && lat <= 49 && lng >= -0.5 && lng <= 5.5);
    });
    expect(outside).toEqual([]);
    expect(placeOf(ids[0])).toEqual(placeOf(ids[0]));
  });

  test("placeOf spreads events over the whole rectangle, tile by tile", () => {
    const ids = publicIds(4000);
    // About 97,800 tiles at z 14: drawn evenly, 4000 events share about 80 of them. Positions
    // on a few lines, as with FNV-1a alone, share hundreds.
    const tiles = new Set(ids.map((id) => tileAt(placeOf(id), 14)));
    expect(tiles.size).toBeGreaterThanOrEqual(3850);

    // 8 × 8 cells of the rectangle, about 62 events each when drawn evenly.
    const cells = new Map<string, number>();
    for (const id of ids) {
      const { lat, lng } = placeOf(id);
      const cell = `${Math.floor(((lat - 43.6) / 5.4) * 8)}/${Math.floor(((lng + 0.5) / 6) * 8)}`;
      cells.set(cell, (cells.get(cell) ?? 0) + 1);
    }
    expect(cells.size).toBe(64);
    for (const [cell, count] of cells) {
      expect(count, cell).toBeGreaterThanOrEqual(30);
      expect(count, cell).toBeLessThanOrEqual(95);
    }

    // Two events that FNV-1a alone put on the same tile (revue de #503).
    expect(tileAt(placeOf("WQMcTPtp"), 14)).not.toBe(tileAt(placeOf("MrTH9oFo"), 14));
  });
});

/**
 * `count` event ids in their real format, 8 symbols of PUBLIC_ID_ALPHABET, without drawing
 * them: the numbers 0, 7,368,787, 2 × 7,368,787… written in base 57.
 */
function publicIds(count: number) {
  const base = PUBLIC_ID_ALPHABET.length;
  return Array.from({ length: count }, (_, i) => {
    let n = i * 7_368_787;
    let id = "";
    for (let digit = 0; digit < 8; digit++) {
      id = PUBLIC_ID_ALPHABET[n % base] + id;
      n = Math.floor(n / base);
    }
    return id;
  });
}
