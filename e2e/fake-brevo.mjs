// The slot's fake Brevo (compose.yaml, service `brevo`), Node alone, no dependency.
// Port 2326: Brevo's transactional e-mail API (https://api.brevo.com/v3/smtp/email),
//   `POST /v3/smtp/email` with a JSON message: a 201 with a message id by default; a message
//   it cannot read (no sender, no recipient, no subject, no content, not JSON), a 400; without
//   `api-key`, a 401; any other path or method, a 404.
// Port 2327: its control, for the end-to-end tests (e2e/mailbox.ts):
//   POST /answers {"to": [address, …], "answer": {"kind", "status"}}  sets the answer to messages for those addresses:
//     `ok` (a 201), `error` (`status`, 400 to 599, 500 by default), `hold` (nothing until released), `never` (nothing, ever);
//   POST /release {"to": [address, …], "answer": {"kind", "status"}}  answers the messages held for those addresses,
//     `ok` by default or `error`, and says how many: {"released": n};
//   GET /messages?to=address  the messages received for that address, oldest first: path, headers, body as sent;
//   GET /health  for the healthcheck.
// Set by address, never for all: the tests run in parallel. An address is one in any case.
// Nothing is ever forgotten while it runs: each test takes addresses of its own (`newAddress`
// in e2e/mailbox.ts). It writes no log: a message holds an address and a token.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const API_PORT = 2326;
const CONTROL_PORT = 2327;
const PATH = "/v3/smtp/email";
/** A message or a control request larger than this is refused: an e-mail of ours is a few kilobytes. */
const MAX_BODY = 1_000_000;
/** One address, as loosely as Brevo's own check would take it. */
const ADDRESS = /^[^\s@]+@[^\s@]+$/;
const KINDS = ["ok", "error", "hold", "never"];
const JSON_TYPE = "application/json; charset=utf-8";

/** @type {Map<string, {kind: string, status: number}>} */
const answers = new Map();
/** @type {Map<string, {path: string, headers: import("node:http").IncomingHttpHeaders, body: unknown}[]>} */
const messages = new Map();
/** @type {Map<string, Set<import("node:http").ServerResponse>>} */
const held = new Map();

const keyOf = (address) => address.toLowerCase();

function sendJson(res, status, body) {
  if (res.destroyed || res.headersSent) return;
  const bytes = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { "Content-Type": JSON_TYPE, "Content-Length": bytes.length }).end(bytes);
}

/** An error as Brevo writes it: a code and a message, never the key nor the message. */
function sendError(res, status, code, message) {
  sendJson(res, status, { code, message: `fake brevo: ${message}` });
}

/** What `ok` or `error` sends. */
function answer(res, { kind, status }) {
  if (kind === "ok") return sendJson(res, 201, { messageId: `<${randomUUID()}@fake-brevo.test>` });
  sendError(res, status, "error", `status ${status}`);
}

/** The body of a request as JSON, or `undefined` when it is not JSON; refused past `MAX_BODY`. */
function readJson(req, then) {
  const chunks = [];
  let size = 0;
  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY) req.destroy();
    else chunks.push(chunk);
  });
  req.on("end", () => {
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      // Not JSON: `undefined`.
    }
    then(body);
  });
}

const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value !== "";

/** The recipients of a message Brevo would take, or `null` when it would refuse it. */
function recipientsOf(message) {
  if (!isObject(message)) return null;
  const { sender, to, subject, textContent, htmlContent } = message;
  if (!isObject(sender) || typeof sender.email !== "string" || !ADDRESS.test(sender.email)) return null;
  if (!Array.isArray(to) || to.length === 0) return null;
  if (!to.every((each) => isObject(each) && typeof each.email === "string" && ADDRESS.test(each.email))) return null;
  if (!isText(subject) || !(isText(textContent) || isText(htmlContent))) return null;
  return to.map((each) => keyOf(each.email));
}

/** The addresses of a control request, or `null`. */
function addressesOf(to) {
  if (!Array.isArray(to) || to.length === 0) return null;
  return to.every((each) => typeof each === "string" && ADDRESS.test(each)) ? to.map(keyOf) : null;
}

/** An answer of a control request, among `kinds`, or `null`. */
function answerOf(value, kinds) {
  if (!isObject(value)) return null;
  const { kind = "ok", status } = value;
  if (!kinds.includes(kind)) return null;
  if (kind !== "error") return status === undefined ? { kind, status: 201 } : null;
  if (status === undefined) return { kind, status: 500 };
  return Number.isInteger(status) && status >= 400 && status <= 599 ? { kind, status } : null;
}

const api = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://brevo");
  if (req.method !== "POST" || url.pathname !== PATH) {
    req.resume();
    return sendError(res, 404, "not_found", `expected a POST on ${PATH}`);
  }
  readJson(req, (message) => {
    const recipients = recipientsOf(message);
    if (!recipients) return sendError(res, 400, "missing_parameter", "expected sender, to, subject and a content");
    // Recorded on arrival, with or without a key: a test sees a message still held, and what
    // the app sent when the fake refused it.
    for (const address of recipients) {
      const received = messages.get(address) ?? [];
      received.push({ path: url.pathname, headers: req.headers, body: message });
      messages.set(address, received);
    }
    if (!req.headers["api-key"]) return sendError(res, 401, "unauthorized", "key not found");

    // The first recipient decides: the app sends to one.
    const set = answers.get(recipients[0]) ?? { kind: "ok", status: 201 };
    if (set.kind === "never") return;
    if (set.kind !== "hold") return answer(res, set);
    const waiting = held.get(recipients[0]) ?? new Set();
    waiting.add(res);
    held.set(recipients[0], waiting);
    // A client that gives up is no longer held.
    res.on("close", () => waiting.delete(res));
  });
});

const control = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://brevo");
  if (req.method === "GET" && url.pathname === "/health") return res.writeHead(204).end();
  if (req.method === "GET" && url.pathname === "/messages") {
    return sendJson(res, 200, messages.get(keyOf(url.searchParams.get("to") ?? "")) ?? []);
  }
  if (req.method !== "POST" || (url.pathname !== "/answers" && url.pathname !== "/release")) {
    req.resume();
    return sendJson(res, 404, { message: "not found" });
  }
  readJson(req, (body) => {
    const release = url.pathname === "/release";
    const addresses = isObject(body) ? addressesOf(body.to) : null;
    const set = isObject(body) ? answerOf(body.answer ?? (release ? {} : undefined), release ? ["ok", "error"] : KINDS) : null;
    if (!addresses || !set) {
      return sendJson(res, 400, { message: 'expected {to: ["address", …], answer: {kind, status}}' });
    }
    if (!release) {
      for (const address of addresses) answers.set(address, set);
      return res.writeHead(204).end();
    }
    let released = 0;
    for (const address of addresses) {
      for (const waiting of held.get(address) ?? []) {
        answer(waiting, set);
        released++;
      }
      held.delete(address);
    }
    sendJson(res, 200, { released });
  });
});

api.listen(API_PORT);
control.listen(CONTROL_PORT);
// PID 1 in its container: without this, `docker compose down` waits for its timeout.
process.on("SIGTERM", () => process.exit(0));
