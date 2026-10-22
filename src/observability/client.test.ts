import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type * as Sentry from "@sentry/nextjs";
import { afterEach, describe, expect, it } from "vitest";
import { type BrowserSdk, startBrowserSentry } from "./client";
import { type SentryEnv } from "./options";
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
 * document; with `withoutProcessors`, a client that takes no event processor.
 */
function load(withoutProcessors = false) {
  return async () =>
    ({
      ...browser,
      browserTracingIntegration: () => ({ name: "BrowserTracing" }),
      init:(options: Parameters<typeof browser.init>[0]) => {
        const client = browser.init({
          ...options,
          sendClientReports: false,
          transport: (transport: Parameters<typeof browser.createTransport>[0]) =>
            browser.createTransport(transport, async ({ body }) => {
              sent.push(typeof body === "string" ? body : new TextDecoder().decode(body));
              return { statusCode: 200 };
            }),
        });
        return withoutProcessors && client ? { on: client.on.bind(client), addEventProcessor: () => {} } : client;
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

/** The functions of the frames sent for that error, and their files. */
async function framesSent(withoutProcessors?: boolean) {
  sent = [];
  await startBrowserSentry(ENV, load(withoutProcessors));
  browser.captureException(errorWithFrameInMessage());
  await browser.flush(2000);
  const items = sent.flatMap((body) => body.split("\n").filter(Boolean).map((line) => JSON.parse(line) as { exception?: unknown }));
  const { exception } = items.find((item) => item.exception) as {
    exception: { values: { stacktrace: { frames: { function?: string; filename?: string }[] } }[] };
  };
  return exception.values.flatMap(({ stacktrace }) => stacktrace.frames);
}

describe("what the browser sends for an error", () => {
  it("sends no line of its message as a frame, a first name as a function's", async () => {
    const frames = await framesSent();
    expect(frames.map((frame) => frame.function)).not.toContain("Marc");
  });

  it("keeps the frames of our chunks, their files normalized", async () => {
    const frames = await framesSent();
    const filename = "app:///_next/static/chunks/app/e/page-3f9ac2.js";
    expect(frames).toEqual([
      { filename, function: "loadTrip", lineno: 1, colno: 2210, in_app: true },
      { filename, function: "onSubmit", lineno: 1, colno: 4410, in_app: true },
    ]);
  });

  it("sends it as a frame without codeFramesOnly, so that the test above means something", async () => {
    const frames = await framesSent(true);
    expect(frames.map((frame) => frame.function)).toContain("Marc");
  });
});
