import type { addIntegration, Event, getClient, NodeOptions } from "@sentry/nextjs";
import { inCode, scrubBreadcrumb, scrubCreatedDsc, scrubDsc, scrubEvent, scrubSpan } from "./scrub";

/*
 * Sentry's options, the same on the server and in the browser (#231, #234). The SDK collects
 * the least it can, and the hooks of `scrub.ts` rebuild what it sends. Without a DSN there
 * are no options at all, and neither side loads the SDK. Only types come from the SDK here.
 */

export type Integration = Parameters<typeof addIntegration>[0];
export type Client = NonNullable<ReturnType<typeof getClient>>;

/** What each side reads from its environment, by name: the browser has its own variables. */
export interface SentryEnv {
  dsn?: string;
  tracesSampleRate?: string;
  release?: string;
  environment?: string;
}

/** Every kind of collection off: what `sendDefaultPii: false` was before v11. */
export const DATA_COLLECTION_OFF = {
  userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false, databaseQueryData: false,
  graphQL: { document: false, variables: false }, genAI: { inputs: false, outputs: false },
  queues: false, stackFrameVariables: false, frameContextLines: 0,
} satisfies Required<NonNullable<NodeOptions["dataCollection"]>>;

/** A number between 0 and 1, written as such; anything else sends no trace. */
export function tracesSampleRate(value: string | undefined): number {
  const rate = value?.trim() ? Number(value) : NaN;
  return rate >= 0 && rate <= 1 ? rate : 0;
}

/** The options of both sides, or `undefined` without a DSN, or with a blank one. */
export function sentryOptions(env: SentryEnv) {
  const dsn = env.dsn?.trim();
  if (!dsn) return undefined;
  return {
    dsn,
    ...(env.release ? { release: env.release } : {}),
    ...(env.environment ? { environment: env.environment } : {}),
    tracesSampleRate: tracesSampleRate(env.tracesSampleRate),
    // `SENTRY_TRACE_LIFECYCLE=static` would otherwise turn `beforeSendSpan` off on the server.
    traceLifecycle: "stream" as const,
    dataCollection: DATA_COLLECTION_OFF,
    tracePropagationTargets: [],
    enhanceFetchErrorMessages: false as const,
    beforeSend: scrubEvent,
    beforeSendSpan: scrubSpan,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}

/**
 * `client.on("beforeEnvelope", …)`: the `trace` header of every envelope. A sampling context
 * frozen on a span, carried by OpenTelemetry or taken from an incoming `baggage` header goes
 * there without `createDsc`. The SDK serializes the envelope it hands over: scrubbed in place.
 */
export function scrubEnvelopeHeader([header]: readonly [object, ...unknown[]]): void {
  const headers = header as { trace?: unknown };
  if (!("trace" in headers)) return;
  const trace = headers.trace;
  headers.trace = scrubDsc(trace !== null && typeof trace === "object" ? (trace as Record<string, unknown>) : {});
}

/**
 * Of every error's stack, and of its causes', the frames of code alone (#360, #361). Both
 * sides' parsers skip a line with `Error: ` in it, the server's the first line too, and make
 * a frame of any other line of a message that reads as one: `    at Marc (…)` would send a
 * first name as a function's. In the browser, a cause's frames escape `allowUrls`, which
 * looks at the thrown error's top frame alone. A processor of the client runs after those of
 * the integrations: by then the browser's frames of code are `app:///_next/…`.
 */
export function codeFramesOnly<E extends Event>(event: E): E {
  for (const value of event.exception?.values ?? []) {
    if (value.stacktrace?.frames) value.stacktrace.frames = value.stacktrace.frames.filter(inCode);
  }
  return event;
}

/** A stack parser of the SDK, as it is: the frames it reads from a stack. */
export type ParseStack = (stack: string) => readonly unknown[];

/*
 * A frame of our own around the line: the parser drops a frame of `captureException` or of
 * `sentryWrapped` at either end of a stack, and would make none of `    at Marc.captureException (…)`.
 */
const AROUND = "    at around (/around.js:1:1)";
const readsAsFrame = (parse: ParseStack, line: string) => parse(`${AROUND}\n${line}\n${AROUND}`).length > 2;

/**
 * Of every error's message, and of its causes', the lines after the first that `parse`, the
 * SDK's own stack parser, makes a frame of (#379, #393): `codeFramesOnly` leaves out that
 * frame, and this the line itself, which `scrubText` would send with the first name in it.
 * Node's parser reads `at ` anywhere in a line, a browser's a line ending in a path: no
 * pattern of ours says it as they do. Reading `at ` anywhere has a cost: lines such as
 * « Le format attendu » or « Un état incohérent » go too, which the project accepts (privacy
 * over diagnostics). The first line is the message's own, which the parsers
 * skip: on the server always, in the browser after the `…Error: ` of the error's name (#239).
 */
export function messagesWithoutFrames(parse: ParseStack) {
  return <E extends Event>(event: E): E => {
    for (const exception of event.exception?.values ?? []) {
      if (typeof exception.value !== "string") continue;
      const lines = exception.value.split("\n");
      exception.value = lines.filter((line, index) => index === 0 || !readsAsFrame(parse, line)).join("\n");
    }
    return event;
  };
}

/** The two hooks the options cannot carry: the sampling context, and every envelope's header. */
export function registerHooks(client: Pick<Client, "on">): void {
  client.on("createDsc", scrubCreatedDsc);
  client.on("beforeEnvelope", scrubEnvelopeHeader);
}

/**
 * An `integrations` option that keeps the defaults named in `names`, and nothing the SDK
 * adds tomorrow; each of `replacements` takes the place of the default of its name.
 */
export function exactIntegrations(names: readonly string[], replacements: Integration[]) {
  return (defaults: Integration[]): Integration[] => {
    const replaced = new Set(replacements.map(({ name }) => name));
    return [...defaults.filter(({ name }) => names.includes(name) && !replaced.has(name)), ...replacements];
  };
}
