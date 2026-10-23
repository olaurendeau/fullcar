import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type * as Sentry from "@sentry/nextjs";
import { afterEach, describe, expect, it } from "vitest";
import { type BrowserSdk, startBrowserSentry } from "./client";
import { type SentryEnv } from "./options";
import { scrubText } from "./scrub";
import { ORIGIN, RELEASE } from "./test-secrets";

/*
 * What the browser sends, through `startBrowserSentry` and the client build of
 * `@sentry/nextjs` 11.8.0 itself, `@sentry/browser`'s stack parser and the frames' Next.js
 * normalization among it. Node resolves `@sentry/nextjs` to the server's build: the client's
 * is loaded by its path. Its transport is handed the serialized envelope.
 */
const require = createRequire(import.meta.url);
const CLIENT_BUILD = fileURLToPath(new URL("../../node_modules/@sentry/nextjs/build/cjs/index.client.js", import.meta.url));
const browser = require(CLIENT_BUILD) as typeof Sentry;

const ENV: SentryEnv = { dsn: "https://public@o1.ingest.de.sentry.io/2", tracesSampleRate: "0", release: RELEASE, environment: "production" };
const CHUNK = `${ORIGIN}/_next/static/chunks/app/e/page-3f9ac2.js`;

let sent: string[];

/**
 * The SDK `startBrowserSentry` loads, but for page loads and navigations, which need a
 * document; with `bare`, the SDK alone: its own stack parser, and a client that takes no
 * event processor.
 */
function load(bare = false) {
  return async () =>
    ({
      ...browser,
      browserTracingIntegration: () => ({ name: "BrowserTracing" }),
      init: (options: Parameters<typeof browser.init>[0]) => {
        const client = browser.init({
          ...options,
          ...(bare ? { stackParser: undefined } : {}),
          sendClientReports: false,
          transport: (transport: Parameters<typeof browser.createTransport>[0]) =>
            browser.createTransport(transport, async ({ body }) => {
              sent.push(typeof body === "string" ? body : new TextDecoder().decode(body));
              return { statusCode: 200 };
            }),
        });
        if (!bare || !client) return client;
        // The hooks of `registerHooks` alone: none on the event itself.
        const on = (hook: string, callback: never) => (hook === "preprocessEvent" ? () => {} : client.on(hook as "createDsc", callback));
        return { on, addEventProcessor: () => {} };
      },
    }) as unknown as BrowserSdk;
}

afterEach(async () => {
  await browser.getClient()?.close();
});

/**
 * An error thrown in our chunk, its cause's message holding a line that reads as a frame,
 * a first name in it, as Chrome writes a stack: its name and message, then its frames.
 */
function errorWithFrameInMessage() {
  const cause = new Error("Le trajet a échoué\n    at Marc (depuis 10:30)");
  cause.stack = `Error: ${cause.message}\n    at loadTrip (${CHUNK}:1:2210)`;
  const error = new Error("Impossible d'afficher le trajet", { cause });
  error.stack = `Error: ${error.message}\n    at onSubmit (${CHUNK}:1:4410)`;
  return error;
}

/** An error thrown in our chunk, its own message holding a line that reads as a frame (#379). */
function thrownWithFrameInMessage() {
  const error = new Error("Le trajet a échoué\n    at Marc (depuis 10:30)");
  error.stack = `Error: ${error.message}\n    at onSubmit (${CHUNK}:1:4410)`;
  return error;
}

/** An error thrown by an extension's script, on top of a frame of ours. */
function thrownByAnExtension() {
  const error = new TypeError("Cannot read properties of undefined");
  error.stack = `TypeError: ${error.message}\n    at inject (chrome-extension://abcdefgh/content.js:3:120)\n    at onSubmit (${CHUNK}:1:4410)`;
  return error;
}

/** An error typed in the console: its one frame names no script by a URL. */
function thrownInTheConsole() {
  const error = new TypeError("x is undefined");
  error.stack = `TypeError: ${error.message}\n    at evaluate (debugger eval code:1:5)`;
  return error;
}

type Frame = { function?: string; filename?: string };
type Sent = { exception: { values: { value?: string; stacktrace: { frames: Frame[] } }[] } };

/** What is sent for `error`: every body as it leaves, and its error event, if any. */
async function send(error: Error, bare?: boolean) {
  sent = [];
  await startBrowserSentry(ENV, load(bare));
  browser.captureException(error);
  await browser.flush(2000);
  const items = sent.flatMap((body) => body.split("\n").filter(Boolean).map((line) => JSON.parse(line) as { exception?: unknown }));
  return { payload: sent.join("\n"), event: items.find((item) => item.exception) as Sent | undefined };
}

/** The frames sent for `error`, of the error and of its causes; `undefined` if nothing is sent. */
async function framesSent(error: Error = errorWithFrameInMessage(), bare?: boolean) {
  const { event } = await send(error, bare);
  return event?.exception.values.flatMap(({ stacktrace }) => stacktrace.frames);
}

const FILENAME = "app:///_next/static/chunks/app/e/page-3f9ac2.js";

describe("what the browser sends for an error", () => {
  it("sends no line of its message as a frame, a first name as a function's", async () => {
    const frames = await framesSent();
    expect(frames?.map((frame) => frame.function)).not.toContain("Marc");
  });

  it("keeps the frames of our chunks, their files normalized", async () => {
    const frames = await framesSent();
    expect(frames).toEqual([
      { filename: FILENAME, function: "loadTrip", lineno: 1, colno: 2210, in_app: true },
      { filename: FILENAME, function: "onSubmit", lineno: 1, colno: 4410, in_app: true },
    ]);
  });

  it("sends an error whose own message holds such a line, without that frame (#379)", async () => {
    const frames = await framesSent(thrownWithFrameInMessage());
    expect(frames).toEqual([{ filename: FILENAME, function: "onSubmit", lineno: 1, colno: 4410, in_app: true }]);
  });

  it("sends the messages without that line, and the first name nowhere, of the error or of its cause (#379)", async () => {
    const thrown = await send(thrownWithFrameInMessage());
    const caused = await send(errorWithFrameInMessage());
    expect([thrown, caused].map(({ event }) => event?.exception.values.map(({ value }) => value))).toEqual([
      ["Le trajet a échoué"],
      ["Le trajet a échoué", scrubText("Impossible d'afficher le trajet")],
    ]);
    // A boolean: a failing assertion prints no part of what was sent (#233).
    expect([thrown, caused].map(({ payload }) => payload.includes("Marc"))).toEqual([false, false]);
  });

  it("sends an error whose message holds a line read as a frame without « at », the first name nowhere (#379)", async () => {
    const results = [];
    for (const line of ["Marc revient le 12/03", "Marc: paquet bundle"]) {
      const error = new Error(`Le trajet a échoué\n${line}`);
      error.stack = `Error: ${error.message}\n    at onSubmit (${CHUNK}:1:4410)`;
      const { event, payload } = await send(error);
      // Booleans: a failing assertion prints no part of what was sent (#233).
      results.push([event !== undefined, payload.includes("Marc")]);
    }
    expect(results).toEqual([[true, false], [true, false]]);
  });

  it("sends an error whose message holds a line read as a frame with a URL, ours or another's, without it (#388)", async () => {
    const results = [];
    for (const line of [
      "Marc https://fullcar.example/_next/x.js:1:2", `    at Marc (${CHUNK}:1:2)`, `Marc@${CHUNK}:1:2`, "    at Marc (https://x.example/a.js:1:2)",
    ]) {
      const error = new Error(`Le trajet a échoué\n${line}`);
      error.stack = `Error: ${error.message}\n    at onSubmit (${CHUNK}:1:4410)`;
      const { event, payload } = await send(error);
      const frames = event?.exception.values.flatMap(({ stacktrace }) => stacktrace.frames.map((frame) => frame.function));
      // Booleans and our own names: a failing assertion prints no part of the message (#233).
      results.push([event !== undefined, payload.includes("Marc"), frames]);
    }
    expect(results).toEqual(Array.from({ length: 4 }, () => [true, false, ["onSubmit"]]));
  });

  it("sends no frame of a line of its message without a file, which the parser gives the file of the line above (#388)", async () => {
    const other = `${ORIGIN}/_next/static/chunks/other-1.js`;
    const error = new Error(`Le trajet a échoué\n    at a (${other}:1:2)\n    at Marc (:1:2)`);
    error.stack = `Error: ${error.message}\n    at onSubmit (${CHUNK}:1:4410)`;
    const { event, payload } = await send(error);
    expect(event?.exception.values.map(({ stacktrace }) => stacktrace.frames.map((frame) => frame.function))).toEqual([["onSubmit"]]);
    // A boolean: a failing assertion prints no part of what was sent (#233).
    expect(payload.includes("Marc")).toBe(false);
  });

  it("keeps a frame of ours that a line of its message names at another place (#388)", async () => {
    const other = `${ORIGIN}/_next/static/chunks/other-1.js`;
    // Each differs from the frame by one of its function, line, column or file.
    const lines = [`    at onLoad (${CHUNK}:1:4410)`, `    at onSubmit (${CHUNK}:2:4410)`, `    at onSubmit (${CHUNK}:1:2)`];
    lines.push(`    at onSubmit (${other}:1:4410)`);
    const error = new Error(["Le trajet a échoué", ...lines].join("\n"));
    error.stack = `Error: ${error.message}\n    at onSubmit (${CHUNK}:1:4410)`;
    expect(await framesSent(error)).toEqual([{ filename: FILENAME, function: "onSubmit", lineno: 1, colno: 4410, in_app: true }]);
  });

  it("keeps the frames of the runtime, Chrome's and Safari's, with ours (#395)", async () => {
    const chrome = new SyntaxError("Unexpected token");
    chrome.stack = [
      `SyntaxError: ${chrome.message}`, "    at JSON.parse (<anonymous>)", "    at Array.map (<anonymous>)",
      `    at onSubmit (${CHUNK}:1:4410)`, "    at new Promise (<anonymous>)",
    ].join("\n");
    const safari = new SyntaxError("JSON Parse error");
    safari.stack = `parse@[native code]\nonSubmit@${CHUNK}:1:4410`;
    const onSubmit = { filename: FILENAME, function: "onSubmit", lineno: 1, colno: 4410, in_app: true };
    expect([await framesSent(chrome), await framesSent(safari)]).toEqual([
      [
        { filename: "<anonymous>", function: "new Promise", in_app: true },
        onSubmit,
        { filename: "<anonymous>", function: "Array.map", in_app: true },
        { filename: "<anonymous>", function: "JSON.parse", in_app: true },
      ],
      [onSubmit, { filename: "[native code]", function: "parse", in_app: true }],
    ]);
  });

  it("sends no frame of the runtime read from a line of its message, nor a first name as one (#395)", async () => {
    const lines = [
      "    at JSON.parse (<anonymous>)", "parse@[native code]", "    at Marc (<anonymous>)", "    at JSON.Marc (<anonymous>)",
      "    at Marc.parse (<anonymous>)", "    at new Marc (<anonymous>)", "Marc@[native code]",
    ];
    const error = new Error(["Le trajet a échoué", ...lines].join("\n"));
    error.stack = `Error: ${error.message}\n    at onSubmit (${CHUNK}:1:4410)`;
    const { event, payload } = await send(error);
    expect(event?.exception.values.map(({ value, stacktrace }) => [value, stacktrace.frames.map((frame) => frame.function)])).toEqual([
      ["Le trajet a échoué", ["onSubmit"]],
    ]);
    // A boolean: a failing assertion prints no part of what was sent (#233).
    expect(payload.includes("Marc")).toBe(false);
  });

  it("sends no error thrown by another script, an extension's, though ours called it", async () => {
    expect(await framesSent(thrownByAnExtension())).toBeUndefined();
  });

  it("sends no error none of whose frames names a script by a URL, as the SDK alone", async () => {
    expect(await framesSent(thrownInTheConsole())).toBeUndefined();
  });

  it("sends that line as a frame with the SDK alone, so that the tests above mean something", async () => {
    const frames = await framesSent(errorWithFrameInMessage(), true);
    expect(frames?.map((frame) => frame.function)).toContain("Marc");
  });
});
