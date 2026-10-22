import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type * as Sentry from "@sentry/nextjs";
import { afterEach, describe, expect, it } from "vitest";
import { type BrowserSdk, messagesWithoutFrames, startBrowserSentry } from "./client";
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
        return bare && client ? { on: client.on.bind(client), addEventProcessor: () => {} } : client;
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

describe("messagesWithoutFrames", () => {
  it("keeps of each message its first line and every line that reads as no frame, of V8 or of SpiderMonkey", () => {
    const message = (value: string) => ({ value, type: "Error" });
    const event = {
      exception: {
        values: [
          message("Échec du trajet\n    at Marc (depuis 10:30)\nMarc@depuis 10:30\n@debugger eval code:1:5\nRéessayez plus tard"),
          message("    at Marc (depuis 10:30)\nat Marc\nonSubmit@https://fullcar.example/_next/a.js:1:2"),
          { type: "Error" },
        ],
      },
    };
    expect(messagesWithoutFrames(event).exception.values).toEqual([
      message("Échec du trajet\nRéessayez plus tard"),
      message("    at Marc (depuis 10:30)"),
      { type: "Error" },
    ]);
  });
});
