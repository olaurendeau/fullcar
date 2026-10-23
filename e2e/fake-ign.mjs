// The slot's fake IGN (compose.yaml, service `ign`), Node alone, no dependency.
// Port 2324: the Géoplateforme's WMTS (https://data.geopf.fr/wmts), `GET /wmts` as a KVP
//   `GetTile`, read from TILEMATRIX, TILEROW and TILECOL: a small PNG tile by default; a
//   request it cannot read, a 400 `InvalidParameterValue` report.
// Port 2325: its control, for the end-to-end tests (e2e/ign.ts):
//   POST /answers {"tiles": ["z/x/y", …], "answer": {"kind", "delayMs"}}  sets the answer to those tiles;
//   GET /requests?tile=z/x/y  the requests received for that tile, oldest first: path, query as sent, headers;
//   GET /health  for the healthcheck.
// Set by tile, never for all: the tests run in parallel. Nothing is ever forgotten while it
// runs: each test takes tiles of its own (`placeOf` in e2e/ign.ts).
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { crc32, deflateSync } from "node:zlib";

const WMTS_PORT = 2324;
const CONTROL_PORT = 2325;
/** A control request larger than this is refused: a test sets a handful of tiles. */
const MAX_CONTROL_BODY = 1_000_000;
/** A decimal integer as written once: `014` would be another URL for the same tile. */
const INTEGER = /^(0|[1-9]\d*)$/;
const TILE = /^(0|[1-9]\d*)\/(0|[1-9]\d*)\/(0|[1-9]\d*)$/;

/** A 256 × 256 PNG, one light grey: 8-bit greyscale, each row its filter byte (none) and 256 pixels. */
function greyTile() {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "latin1"), data])));
    return Buffer.concat([length, Buffer.from(type, "latin1"), data, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(256, 0);
  header.writeUInt32BE(256, 4);
  header.set([8, 0, 0, 0, 0], 8); // bit depth 8, greyscale, deflate, adaptive filtering, no interlace
  const rows = Buffer.alloc(256 * 257, 0xee);
  for (let row = 0; row < 256; row++) rows[row * 257] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** An OWS exception report, written as the real service writes its own. */
function exceptionReport(code, text) {
  return `<ExceptionReport xmlns="http://www.opengis.net/ows/1.1"><Exception exceptionCode="${code}" >${text}</Exception></ExceptionReport>`;
}

const XML = "text/xml; charset=UTF-8";

/** What each kind of answer sends: its status, its Content-Type, its body. */
const RESPONSES = {
  tile: { status: 200, type: "image/png", body: greyTile() },
  // The real service's body for a tile it does not have, captured once (relevé de #473, #238).
  notFound: { status: 404, type: XML, body: readFileSync(new URL("./ign-not-found.xml", import.meta.url)) },
  // What a wrong `IGN_WMTS_URL` could meet: a 404 page, no OWS report.
  notFoundBare: {
    status: 404,
    type: "text/html; charset=utf-8",
    body: Buffer.from("<html><head><title>404 Not Found</title></head><body><h1>404 Not Found</h1></body></html>"),
  },
  invalidParameter: {
    status: 400,
    type: XML,
    body: Buffer.from(exceptionReport("InvalidParameterValue", "fake IGN: an invalid parameter value")),
  },
  forbidden: { status: 403, type: "text/plain; charset=utf-8", body: Buffer.from("fake IGN: status 403") },
  tooMany: { status: 429, type: "text/plain; charset=utf-8", body: Buffer.from("fake IGN: status 429") },
  error: { status: 500, type: "text/plain; charset=utf-8", body: Buffer.from("fake IGN: status 500") },
};

/** @type {Map<string, {kind: keyof typeof RESPONSES, delayMs: number}>} */
const answers = new Map();
/** @type {Map<string, {path: string, query: string, headers: import("node:http").IncomingHttpHeaders}[]>} */
const requests = new Map();

function send(res, { status, type, body }) {
  if (res.destroyed) return;
  res.writeHead(status, { "Content-Type": type, "Content-Length": body.length }).end(body);
}

function sendJson(res, status, body) {
  send(res, { status, type: "application/json; charset=utf-8", body: Buffer.from(JSON.stringify(body)) });
}

/** A KVP parameter by its name, in any case, as OGC reads them; `null` when absent. */
function parameter(url, name) {
  for (const [key, value] of url.searchParams) if (key.toUpperCase() === name) return value;
  return null;
}

/** The tile `z/x/y` of a `GetTile`, or why it cannot be read. */
function tileOf(req, url) {
  if (req.method !== "GET" || url.pathname !== "/wmts") return { error: "a GET on /wmts" };
  if (parameter(url, "REQUEST") !== "GetTile") return { error: "REQUEST=GetTile" };
  const [z, y, x] = ["TILEMATRIX", "TILEROW", "TILECOL"].map((name) => parameter(url, name));
  for (const [name, value] of [["TILEMATRIX", z], ["TILEROW", y], ["TILECOL", x]]) {
    if (value === null || !INTEGER.test(value)) return { error: `${name}, a decimal integer` };
  }
  return { tile: `${z}/${x}/${y}` };
}

/** The setting of a control request, or `null` when it is refused. */
function settingOf(body) {
  if (typeof body !== "object" || body === null) return null;
  const { tiles, answer } = body;
  if (!Array.isArray(tiles) || tiles.length === 0) return null;
  if (!tiles.every((tile) => typeof tile === "string" && TILE.test(tile))) return null;
  if (typeof answer !== "object" || answer === null) return null;
  const { kind = "tile", delayMs = 0 } = answer;
  if (typeof kind !== "string" || !Object.hasOwn(RESPONSES, kind)) return null;
  if (typeof delayMs !== "number" || !Number.isFinite(delayMs) || delayMs < 0) return null;
  return { tiles, answer: { kind, delayMs } };
}

const wmts = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://ign");
  const read = tileOf(req, url);
  if (read.error) {
    return send(res, {
      ...RESPONSES.invalidParameter,
      body: Buffer.from(exceptionReport("InvalidParameterValue", `fake IGN: expected ${read.error}`)),
    });
  }
  // Recorded on arrival: a test sees a request still waiting for its delay.
  const received = requests.get(read.tile) ?? [];
  received.push({ path: url.pathname, query: url.search.slice(1), headers: req.headers });
  requests.set(read.tile, received);

  const { kind, delayMs } = answers.get(read.tile) ?? { kind: "tile", delayMs: 0 };
  setTimeout(() => send(res, RESPONSES[kind]), delayMs);
});

const control = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://ign");
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
    if (!set) return sendJson(res, 400, { message: 'expected {tiles: ["z/x/y", …], answer: {kind, delayMs}}' });
    for (const tile of set.tiles) answers.set(tile, set.answer);
    res.writeHead(204).end();
  });
});

wmts.listen(WMTS_PORT);
control.listen(CONTROL_PORT);
// PID 1 in its container: without this, `docker compose down` waits for its timeout.
process.on("SIGTERM", () => process.exit(0));
