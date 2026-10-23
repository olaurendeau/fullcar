// The slot's fake Photon (compose.yaml, service `photon`), Node alone, no dependency.
// Port 2322: Photon's search API (https://photon.komoot.io), in its GeoJSON, empty by default.
// Port 2323: its control, for the end-to-end tests (e2e/photon.ts):
//   POST /answers {"text", "answer": {"features", "status", "delayMs"}}  sets the answer to `q` = text, exactly;
//   GET /requests?q=text  the requests received for that text, oldest first: path, query as sent, headers;
//   GET /health  for the healthcheck.
// Nothing is ever forgotten while it runs: each test picks texts of its own.
import { createServer } from "node:http";

const API_PORT = 2322;
const CONTROL_PORT = 2323;
/** A control request larger than this is refused: a test sets a handful of features. */
const MAX_CONTROL_BODY = 1_000_000;

/** @type {Map<string, {features: unknown[], status: number, delayMs: number}>} */
const answers = new Map();
/** @type {Map<string, {path: string, query: string, headers: import("node:http").IncomingHttpHeaders}[]>} */
const requests = new Map();

function sendJson(res, status, body) {
  if (res.destroyed) return;
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify(body));
}

/** The answer of a control request, or why it is refused. */
function answerOf(body) {
  if (typeof body !== "object" || body === null) return null;
  const { text, answer } = body;
  if (typeof text !== "string" || typeof answer !== "object" || answer === null) return null;
  const { features = [], status = 200, delayMs = 0 } = answer;
  if (!Array.isArray(features)) return null;
  if (!Number.isInteger(status) || status < 200 || status > 599) return null;
  if (typeof delayMs !== "number" || !Number.isFinite(delayMs) || delayMs < 0) return null;
  return { text, answer: { features, status, delayMs } };
}

const api = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://photon");
  const q = url.searchParams.get("q") ?? "";
  // Recorded on arrival: a test sees a request still waiting for its delay.
  const received = requests.get(q) ?? [];
  received.push({ path: url.pathname, query: url.search.slice(1), headers: req.headers });
  requests.set(q, received);

  if (req.method !== "GET" || (url.pathname !== "/api" && url.pathname !== "/api/")) {
    return sendJson(res, 404, { message: "not found" });
  }
  const { features, status, delayMs } = answers.get(q) ?? { features: [], status: 200, delayMs: 0 };
  setTimeout(() => {
    if (status === 200) sendJson(res, 200, { type: "FeatureCollection", features });
    else sendJson(res, status, { message: `fake Photon: status ${status}` });
  }, delayMs);
});

const control = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://photon");
  if (req.method === "GET" && url.pathname === "/health") return res.writeHead(204).end();
  if (req.method === "GET" && url.pathname === "/requests") {
    return sendJson(res, 200, requests.get(url.searchParams.get("q") ?? "") ?? []);
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
      set = answerOf(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    } catch {
      // Not JSON: refused below.
    }
    if (!set) return sendJson(res, 400, { message: "expected {text, answer: {features, status, delayMs}}" });
    answers.set(set.text, set.answer);
    res.writeHead(204).end();
  });
});

api.listen(API_PORT);
control.listen(CONTROL_PORT);
// PID 1 in its container: without this, `docker compose down` waits for its timeout.
process.on("SIGTERM", () => process.exit(0));
