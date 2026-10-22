import { isDeepStrictEqual } from "node:util";
import {
  captureException, continueTrace, createTransport, defaultStackParser, getDefaultIntegrations, initWithoutDefaultIntegrations,
  startSpan, type NodeClient,
} from "@sentry/nextjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BROWSER_INTEGRATIONS, beforeStartSpan, browserEnv, type BrowserSdk, messagesWithoutFrames, startBrowserSentry } from "./client";
import {
  codeFramesOnly, type Integration, registerHooks, scrubEnvelopeHeader, sentryOptions, type SentryEnv, tracesSampleRate,
} from "./options";
import { scrubBreadcrumb, scrubCreatedDsc, scrubEvent, scrubSpan } from "./scrub";
import {
  databaseErrors, registerServerHooks, reportRequestError, SERVER_INTEGRATIONS, type ServerSdk, serverEnv,
  startServerSentry,
} from "./server";
import { drawSecrets, leakedKinds, RELEASE } from "./test-secrets";

const DSN = "https://public@o1.ingest.de.sentry.io/2";
const ENV: SentryEnv = { dsn: DSN, tracesSampleRate: "1", release: RELEASE, environment: "production" };
const NO_DSN: SentryEnv[] = [{}, { ...ENV, dsn: undefined }, { ...ENV, dsn: "" }, { ...ENV, dsn: " \t " }];

/** A client that records what is registered on it, and the SDK that hands it out. */
function fakeClient() {
  return { on: vi.fn(), addEventProcessor: vi.fn() };
}
const named = (name: string, options?: object) => ({ name, options }) as Integration;

function fakeServerSdk(client = fakeClient()) {
  const sdk = {
    init: vi.fn(() => client),
    httpIntegration: vi.fn((options?: object) => named("Http", options)),
    captureRequestError: vi.fn(),
  };
  return { sdk, client, load: vi.fn(async () => sdk as unknown as ServerSdk) };
}

function fakeBrowserSdk(client = fakeClient()) {
  const sdk = {
    init: vi.fn(() => client),
    browserTracingIntegration: vi.fn((options?: object) => named("BrowserTracing", options)),
    captureRouterTransitionStart: vi.fn(),
    defaultStackParser: vi.fn((): { filename?: string }[] => []),
  };
  return { sdk, client, load: vi.fn(async () => sdk as unknown as BrowserSdk) };
}

type Options = ReturnType<NonNullable<typeof sentryOptions>> & { integrations: (defaults: Integration[]) => Integration[] };
const initOptions = (init: { mock: { calls: unknown[][] } }) => init.mock.calls[0][0] as NonNullable<Options>;
const names = (integrations: Integration[]) => integrations.map(({ name }) => name);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sentryOptions", () => {
  it("is undefined without a DSN, or with an empty or blank one", () => {
    expect(NO_DSN.map(sentryOptions)).toEqual([undefined, undefined, undefined, undefined]);
  });

  it("reads the sample rate as a number between 0 and 1, and 0 otherwise", () => {
    expect(["0.2", "0", "1", "abc", "2", "-0.1", "", undefined].map(tracesSampleRate)).toEqual([0.2, 0, 1, 0, 0, 0, 0, 0]);
  });

  it("turns every kind of data collection off", () => {
    expect(sentryOptions(ENV)?.dataCollection).toEqual({
      userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false, databaseQueryData: false,
      graphQL: { document: false, variables: false }, genAI: { inputs: false, outputs: false },
      queues: false, stackFrameVariables: false, frameContextLines: 0,
    });
  });

  it("streams spans whatever SENTRY_TRACE_LIFECYCLE says, and propagates no trace", () => {
    const options = sentryOptions(ENV);
    expect([options?.traceLifecycle, options?.tracePropagationTargets, options?.enhanceFetchErrorMessages]).toEqual(["stream", [], false]);
  });

  it("has exactly the hooks of scrub.ts, and no replay", () => {
    const options = sentryOptions(ENV) ?? {};
    const hooks = Object.entries(options).filter(([key]) => key.startsWith("before"));
    expect(Object.fromEntries(hooks)).toEqual({ beforeSend: scrubEvent, beforeSendSpan: scrubSpan, beforeBreadcrumb: scrubBreadcrumb });
    expect(Object.keys(options).filter((key) => /replay/i.test(key))).toEqual([]);
  });

  it("takes the release and the environment from Vercel's variables, prefixed in the browser", () => {
    const server = { NEXT_PUBLIC_SENTRY_DSN: DSN, NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: "0.2", VERCEL_GIT_COMMIT_SHA: RELEASE, VERCEL_ENV: "preview" };
    expect(serverEnv(server)).toEqual({ dsn: DSN, tracesSampleRate: "0.2", release: RELEASE, environment: "preview" });
    for (const [key, value] of Object.entries({ ...server, VERCEL_GIT_COMMIT_SHA: undefined, VERCEL_ENV: undefined })) vi.stubEnv(key, value);
    vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA", RELEASE);
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production");
    expect(browserEnv()).toEqual({ dsn: DSN, tracesSampleRate: "0.2", release: RELEASE, environment: "production" });
    const { release, environment } = sentryOptions(serverEnv(server)) ?? {};
    expect([release, environment]).toEqual([RELEASE, "preview"]);
    expect(Object.keys(sentryOptions({ dsn: DSN }) ?? {})).not.toContain("release");
  });
});

describe("without a DSN", () => {
  it.each(NO_DSN.map((env) => [JSON.stringify(env), env]))("loads nothing, %s", async (_, env) => {
    const server = fakeServerSdk();
    const browser = fakeBrowserSdk();
    await startServerSentry(env, server.load);
    await reportRequestError(env, [new Error("x"), { path: "/", method: "GET", headers: {} }, { routerKind: "App Router", routePath: "/", routeType: "render" }], server.load);
    expect(await startBrowserSentry(env, browser.load)).toBeUndefined();
    expect([server.load.mock.calls.length, browser.load.mock.calls.length]).toEqual([0, 0]);
  });
});

describe("on the server, with a DSN", () => {
  it("calls init once, with the options, and registers the sampling context's and the envelope's hooks", async () => {
    const { sdk, client, load } = fakeServerSdk();
    await startServerSentry(ENV, load);
    expect(sdk.init).toHaveBeenCalledTimes(1);
    const { integrations, ...options } = initOptions(sdk.init);
    expect(options).toEqual(sentryOptions(ENV));
    expect(typeof integrations).toBe("function");
    expect(client.on.mock.calls).toEqual([["createDsc", scrubCreatedDsc], ["beforeEnvelope", scrubEnvelopeHeader]]);
    expect(client.addEventProcessor.mock.calls).toEqual([[codeFramesOnly], [databaseErrors]]);
  });

  it("keeps the exact list of integrations, Http without sessions", async () => {
    const { sdk, load } = fakeServerSdk();
    await startServerSentry(ENV, load);
    const defaults = [...getDefaultIntegrations({ tracesSampleRate: 1 }), named("DistDirRewriteFrames"), named("NextjsUseCache")];
    const kept = initOptions(sdk.init).integrations(defaults);
    expect(names(kept).sort()).toEqual([...SERVER_INTEGRATIONS].sort());
    expect(kept.find(({ name }) => name === "Http")).toEqual(named("Http", { disableIncomingRequestSpans: true, sessions: false }));
  });

  it("reports a database error by its code alone, and leaves other errors as they are", () => {
    const event = () => ({ exception: { values: [{ type: "Error", value: "cause" }, { type: "error", value: "thrown" }] } });
    const values = (code: object) => databaseErrors(event(), { originalException: code }).exception.values.map(({ value }) => value);
    expect(values({ code: "23505", message: "duplicate key" })).toEqual(["cause", "database error (SQLSTATE 23505)"]);
    expect(values({ code: "ECONNREFUSED", errno: -111 })).toEqual(["cause", "database error (errno -111)"]);
    expect(values(new Error("thrown"))).toEqual(["cause", "thrown"]);
  });

  it("keeps of every error's stack the frames of code alone, none of the lines of its message", () => {
    // The parser skips the first line of a stack, whatever the error's name, and only that one.
    const frames = (...lines: string[]) =>
      defaultStackParser([...lines.slice(0, 1), "    at Marc (depuis 10:30)", "    at row 12", ...lines.slice(1)].join("\n"), 1);
    const event = {
      exception: {
        values: [
          {
            type: "error",
            value: "cause",
            stacktrace: {
              frames: frames('error: invalid input syntax: "seat', "    at Parser.parse (/var/task/node_modules/pg-protocol/dist/parser.js:285:98)"),
            },
          },
          {
            type: "Error",
            value: "thrown",
            stacktrace: {
              frames: frames("Error: Le trajet a échoué", "    at async loadEvent (/var/task/.next/server/chunks/ssr/4821.js:1:2345)"),
            },
          },
        ],
      },
    };
    const functions = (each: typeof event) => each.exception.values.map(({ stacktrace }) => stacktrace.frames.map((frame) => frame.function));
    expect(functions(event).flat()).toContain("Marc");
    expect(functions(codeFramesOnly(event))).toEqual([["Parser.parse"], ["loadEvent"]]);
  });

  it("hands a request's error to captureRequestError", async () => {
    const { sdk, load } = fakeServerSdk();
    const args = [new Error("x"), { path: "/", method: "GET", headers: {} }, { routerKind: "App Router", routePath: "/", routeType: "render" }] as const;
    await reportRequestError(ENV, [...args], load);
    expect(sdk.captureRequestError.mock.calls).toEqual([[...args]]);
  });
});

describe("in the browser, with a DSN", () => {
  const BROWSER_DEFAULTS = [
    "EventFilters", "FunctionToString", "ConversationId", "BrowserApiErrors", "Breadcrumbs", "Console", "GlobalHandlers", "LinkedErrors",
    "Dedupe", "HttpContext", "CultureContext", "BrowserSession", "BrowserTracing", "NextjsClientStackFrameNormalization", "Replay",
  ];

  it("calls init once, with the options, our scripts only, their frames, the same hooks, and the frames of code alone", async () => {
    const { sdk, client, load } = fakeBrowserSdk();
    expect(await startBrowserSentry(ENV, load)).toBe(sdk);
    expect(sdk.init).toHaveBeenCalledTimes(1);
    const { integrations, allowUrls, stackParser, ...options } = initOptions(sdk.init) as Options & {
      allowUrls: RegExp[];
      stackParser: (stack: string) => unknown[];
    };
    expect(options).toEqual(sentryOptions(ENV));
    expect([typeof integrations, allowUrls]).toEqual(["function", [/\/_next\//]]);
    sdk.defaultStackParser.mockReturnValueOnce([{ filename: "depuis 10" }, { filename: "chrome-extension://abcdefgh/content.js" }]);
    expect(stackParser("the stack")).toEqual([{ filename: "chrome-extension://abcdefgh/content.js" }]);
    expect(client.on.mock.calls).toEqual([["createDsc", scrubCreatedDsc], ["beforeEnvelope", scrubEnvelopeHeader]]);
    expect(client.addEventProcessor.mock.calls).toEqual([[codeFramesOnly], [messagesWithoutFrames]]);
  });

  it("keeps the exact list of integrations, page loads and navigations named without their URL", async () => {
    const { sdk, load } = fakeBrowserSdk();
    await startBrowserSentry(ENV, load);
    const kept = initOptions(sdk.init).integrations(BROWSER_DEFAULTS.map((name) => named(name)));
    expect(names(kept).sort()).toEqual([...BROWSER_INTEGRATIONS].sort());
    expect(kept.find(({ name }) => name === "BrowserTracing")).toEqual(named("BrowserTracing", { beforeStartSpan }));
    const secrets = drawSecrets();
    expect(leakedKinds(JSON.stringify(beforeStartSpan({ name: secrets.adminUrl, op: "navigation" })), secrets)).toEqual([]);
  });
});

/*
 * Through the SDK's own `init`, with the options above: what leaves, headers included. The
 * transport is handed the serialized envelope.
 */
describe("what the SDK sends with these options", () => {
  let client: NodeClient | undefined;
  let sent: string[];

  function start(hooks: (client: NodeClient) => void = registerHooks) {
    sent = [];
    client = initWithoutDefaultIntegrations({
      ...sentryOptions(ENV),
      sendClientReports: false,
      transport: (options) =>
        createTransport(options, async ({ body }) => {
          sent.push(typeof body === "string" ? body : new TextDecoder().decode(body));
          return { statusCode: 200 };
        }),
    });
    if (client) hooks(client);
  }

  afterEach(async () => {
    await client?.close();
  });

  /** A request that arrives with a trace, its `baggage` naming the admin link: what a visitor's own SDK, or anyone, may send. */
  async function sendFromIncomingTrace(secrets: ReturnType<typeof drawSecrets>) {
    const baggage = `sentry-trace_id=1e0b944204cd40f8a6d7baf905604927,sentry-public_key=public,sentry-sampled=true,sentry-transaction=${encodeURIComponent(secrets.adminUrl)}`;
    await continueTrace({ sentryTrace: "1e0b944204cd40f8a6d7baf905604927-80751a90a011d3f8-1", baggage }, () =>
      startSpan({ name: "GET /e/[id]/admin" }, () => {
        captureException(new Error("failed"));
      }),
    );
    await client?.flush(2000);
  }

  it("streams spans through beforeSendSpan, even with SENTRY_TRACE_LIFECYCLE=static", async () => {
    vi.stubEnv("SENTRY_TRACE_LIFECYCLE", "static");
    start();
    const secrets = drawSecrets();
    startSpan({ name: `GET ${secrets.adminUrl}` }, () => {});
    await client?.flush(2000);
    expect(client?.getOptions().traceLifecycle).toBe("stream");
    expect(sent.some((body) => body.includes('"type":"span"'))).toBe(true);
    expect(leakedKinds(sent.join("\n"), secrets)).toEqual([]);
  });

  it("scrubs the trace header that an incoming baggage header sets", async () => {
    start();
    const secrets = drawSecrets();
    await sendFromIncomingTrace(secrets);
    const headers = sent.map((body) => JSON.parse(body.split("\n")[0]) as { trace?: { transaction?: string } });
    expect(isDeepStrictEqual(headers.map(({ trace }) => trace?.transaction), [
      "https://fullcar.example/e/[id]/admin", "https://fullcar.example/e/[id]/admin",
    ])).toBe(true);
    expect(leakedKinds(sent.join("\n"), secrets)).toEqual([]);
  });

  /** The functions of the frames sent for an error whose message holds a line that reads as a frame, a first name in it. */
  async function framesOfErrorWithFrameInMessage() {
    captureException(new Error("Le trajet a échoué\n    at Marc (depuis 10:30)"));
    await client?.flush(2000);
    const items = sent.flatMap((body) => body.split("\n").filter(Boolean).map((line) => JSON.parse(line) as { exception?: unknown }));
    const { exception } = items.find((item) => item.exception) as { exception: { values: { stacktrace: { frames: { function?: string }[] } }[] } };
    return exception.values.flatMap(({ stacktrace }) => stacktrace.frames.map((frame) => frame.function));
  }

  it("sends no line of an error's message as a frame from the server", async () => {
    start(registerServerHooks);
    const functions = await framesOfErrorWithFrameInMessage();
    expect(functions.length).toBeGreaterThan(0);
    expect(functions).not.toContain("Marc");
  });

  it("sends it as a frame without codeFramesOnly, so that the test above means something", async () => {
    start();
    expect(await framesOfErrorWithFrameInMessage()).toContain("Marc");
  });

  it("leaks it without the envelope's hook, so that [] above means something", async () => {
    start((each) => each.on("createDsc", scrubCreatedDsc));
    const secrets = drawSecrets();
    await sendFromIncomingTrace(secrets);
    expect(leakedKinds(sent.join("\n"), secrets)).toEqual(["admin link", "admin token", "event id"]);
  });
});
