// The slot's fake tile provider (compose.yaml, service `tiles`), Node alone, no dependency.
// Port 2324: Geoapify's raster tiles (https://maps.geoapify.com/v1/tile),
//   `GET /v1/tile/{style}/{z}/{x}/{y}@2x.png?apiKey=…`: a grey PNG of 512 × 512 by default;
//   without `apiKey`, a 401; a request it cannot read, a 400.
// Port 2325: its control, for the end-to-end tests (e2e/tiles.ts):
//   POST /answers {"tiles": ["z/x/y", …], "answer": {"kind", "retryAfter", "delayMs"}}  sets the answer to those tiles
//     (`retryAfter` for `tooMany` only, sent as is in `Retry-After`; `delayMs` from 0 to 2³¹ − 1);
//   GET /requests?tile=z/x/y  the requests received for that tile, oldest first: path, query as sent, headers;
//   GET /health  for the healthcheck.
// Set by tile, never for all: the tests run in parallel. Nothing is ever forgotten while it
// runs: each test takes tiles of its own (`tileOf` in e2e/tiles.ts).
import { createServer } from "node:http";
import { crc32, deflateSync } from "node:zlib";

const TILE_PORT = 2324;
const CONTROL_PORT = 2325;
/** A control request larger than this is refused: a test sets a handful of tiles. */
const MAX_CONTROL_BODY = 1_000_000;
/** The longest a timer holds: past it, Node waits 1 ms, and « never answers » would answer at once. */
const MAX_DELAY_MS = 2 ** 31 - 1;
/** A tile as the app asks for it: a style, then decimal integers as written once (`014` would be another URL). */
const TILE_PATH = /^\/v1\/tile\/[a-z0-9-]+\/(0|[1-9]\d*)\/(0|[1-9]\d*)\/(0|[1-9]\d*)@2x\.png$/;
const TILE = /^(0|[1-9]\d*)\/(0|[1-9]\d*)\/(0|[1-9]\d*)$/;
/** What a header may carry as is: visible ASCII and spaces, so that Node never refuses to send it. */
const HEADER_VALUE = /^[\x20-\x7e]+$/;
const SIZE = 512;

/** A 512 × 512 PNG, one light grey: 8-bit greyscale, each row its filter byte (none) and 512 pixels. */
function greyTile() {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "latin1"), data])));
    return Buffer.concat([length, Buffer.from(type, "latin1"), data, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(SIZE, 0);
  header.writeUInt32BE(SIZE, 4);
  header.set([8, 0, 0, 0, 0], 8); // bit depth 8, greyscale, deflate, adaptive filtering, no interlace
  const rows = Buffer.alloc(SIZE * (SIZE + 1), 0xee);
  for (let row = 0; row < SIZE; row++) rows[row * (SIZE + 1)] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const JSON_TYPE = "application/json; charset=utf-8";

/** An error as the fake writes it: a JSON body, never the key nor the request. */
function failure(status, error, message) {
  return { status, type: JSON_TYPE, body: Buffer.from(JSON.stringify({ statusCode: status, error, message })) };
}

/** What each kind of answer sends: its status, its Content-Type, its body. */
const RESPONSES = {
  tile: { status: 200, type: "image/png", body: greyTile() },
  unauthorized: failure(401, "Unauthorized", "fake tiles: status 401"),
  forbidden: failure(403, "Forbidden", "fake tiles: status 403"),
  notFound: failure(404, "Not Found", "fake tiles: status 404"),
  tooMany: failure(429, "Too Many Requests", "fake tiles: status 429"),
  error: failure(500, "Internal Server Error", "fake tiles: status 500"),
  // A 200 that is no tile: what a portal or a proxy could answer in its place.
  notPng: {
    status: 200,
    type: "text/html; charset=utf-8",
    body: Buffer.from("<html><head><title>fake tiles</title></head><body>No tile here.</body></html>"),
  },
};

/** @type {Map<string, {kind: keyof typeof RESPONSES, retryAfter?: string, delayMs: number}>} */
const answers = new Map();
/** @type {Map<string, {path: string, query: string, headers: import("node:http").IncomingHttpHeaders}[]>} */
const requests = new Map();

function send(res, { status, type, body }, headers = {}) {
  if (res.destroyed) return;
  res.writeHead(status, { ...headers, "Content-Type": type, "Content-Length": body.length }).end(body);
}

function sendJson(res, status, body) {
  send(res, { status, type: JSON_TYPE, body: Buffer.from(JSON.stringify(body)) });
}

/** The setting of a control request, or `null` when it is refused. */
function settingOf(body) {
  if (typeof body !== "object" || body === null) return null;
  const { tiles, answer } = body;
  if (!Array.isArray(tiles) || tiles.length === 0) return null;
  if (!tiles.every((tile) => typeof tile === "string" && TILE.test(tile))) return null;
  if (typeof answer !== "object" || answer === null) return null;
  const { kind = "tile", retryAfter, delayMs = 0 } = answer;
  if (typeof kind !== "string" || !Object.hasOwn(RESPONSES, kind)) return null;
  if (retryAfter !== undefined && (kind !== "tooMany" || typeof retryAfter !== "string" || !HEADER_VALUE.test(retryAfter))) {
    return null;
  }
  if (typeof delayMs !== "number" || !Number.isFinite(delayMs) || delayMs < 0 || delayMs > MAX_DELAY_MS) return null;
  return { tiles, answer: retryAfter === undefined ? { kind, delayMs } : { kind, retryAfter, delayMs } };
}

const tiles = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://tiles");
  const read = req.method === "GET" ? TILE_PATH.exec(url.pathname) : null;
  if (!read) return send(res, failure(400, "Bad Request", "fake tiles: expected a GET on /v1/tile/{style}/{z}/{x}/{y}@2x.png"));
  const [, z, x, y] = read;
  const tile = `${z}/${x}/${y}`;
  // Recorded on arrival, with or without a key: a test sees a request still waiting for its
  // delay, and what the app sent when the fake refused it.
  const received = requests.get(tile) ?? [];
  received.push({ path: url.pathname, query: url.search.slice(1), headers: req.headers });
  requests.set(tile, received);

  if (!url.searchParams.get("apiKey")) return send(res, failure(401, "Unauthorized", "fake tiles: no apiKey"));
  const { kind, retryAfter, delayMs } = answers.get(tile) ?? { kind: "tile", delayMs: 0 };
  setTimeout(() => send(res, RESPONSES[kind], retryAfter === undefined ? {} : { "Retry-After": retryAfter }), delayMs);
});

const control = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://tiles");
  if (req.method === "GET" && url.pathname === "/health") return res.writeHead(204).end();
  if (req.method === "GET" && url.pathname === "/requests") {
    return sendJson(res, 200, requests.get(url.searchParams.get("tile") ?? "") ?? []);
  }
  if (req.method !== "POST" || url.pathname !== "/answers") return sendJson(res, 404, { message: "not found" });

  const chunks = [];
  let size = 0;
  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > MAX_CONTROL_BODY) req.destroy();
    else chunks.push(chunk);
  });
  req.on("end", () => {
    let set = null;
    try {
      set = settingOf(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    } catch {
      // Not JSON: refused below.
    }
    if (!set) {
      return sendJson(res, 400, { message: 'expected {tiles: ["z/x/y", …], answer: {kind, retryAfter, delayMs}}' });
    }
    for (const tile of set.tiles) answers.set(tile, set.answer);
    res.writeHead(204).end();
  });
});

tiles.listen(TILE_PORT);
control.listen(CONTROL_PORT);
// PID 1 in its container: without this, `docker compose down` waits for its timeout.
process.on("SIGTERM", () => process.exit(0));
