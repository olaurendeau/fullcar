import type { addIntegration, Event, getClient, NodeOptions, StackFrame } from "@sentry/nextjs";
import { inCode, inRuntime, scrubBreadcrumb, scrubCreatedDsc, scrubDsc, scrubEvent, scrubSpan } from "./scrub";

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
 * the integrations: by then the browser's frames of code are `app:///_next/…`. The frames
 * of the runtime stay too, those of a built-in only (#395): `JSON.parse (<anonymous>)`.
 */
export function codeFramesOnly<E extends Event>(event: E): E {
  for (const value of event.exception?.values ?? []) {
    if (value.stacktrace?.frames) value.stacktrace.frames = value.stacktrace.frames.filter((frame) => inCode(frame) || inRuntime(frame));
  }
  return event;
}

/** A stack parser of the SDK, as it is: the frames it reads from a stack. */
export type ParseStack = (stack: string) => readonly StackFrame[];

/*
 * A frame of our own around the line: the parser drops a frame of `captureException` or of
 * `sentryWrapped` at either end of a stack, and would make none of `    at Marc.captureException (…)`.
 */
const AROUND_FILE = "/around.js";
const AROUND = `    at around (${AROUND_FILE}:1:1)`;
const framesOf = (parse: ParseStack, line: string) => parse(`${AROUND}\n${line}\n${AROUND}`).slice(1, -1);
/*
 * Whether `frame` of the stack is the one `read` from a line of the message. A frame read
 * without a file (`    at Marc (:1:2)`) is given the file of the top line of the stack it
 * was read in (`stripSentryFramesAndReverse`, `@sentry/core`): here `AROUND_FILE`, in the
 * error's own stack the file of whichever line comes first. Such a frame is compared without
 * its file, by its function, line and column alone.
 */
const readAs = (read: StackFrame) => (frame: StackFrame) =>
  read.function === frame.function && read.lineno === frame.lineno && read.colno === frame.colno &&
  (read.filename === AROUND_FILE || read.filename === frame.filename);

/**
 * Of every error's message, and of its causes', the lines after the first that `parse`, the
 * SDK's own stack parser, makes a frame of (#379, #393): `codeFramesOnly` leaves out that
 * frame, and this the line itself, which `scrubText` would send with the first name in it.
 * Node's parser reads `at ` anywhere in a line, a browser's a line ending in a path: no
 * pattern of ours says it as they do. Reading `at ` anywhere has a cost: lines such as
 * « Le format attendu » or « Un état incohérent » go too, which the project accepts (privacy
 * over diagnostics). The first line is the message's own, which the parsers
 * skip: on the server always, in the browser after the `…Error: ` of the error's name (#239).
 * The frame that such a line reads as leaves the stack too, whatever its file (#395, #388):
 * V8 writes the message at the top of the stack, and `    at Marc (https://…/_next/a.js:1:2)`
 * there is no frame. Registered on `preprocessEvent`, this runs before every event processor:
 * `allowUrls` then looks at the error's real top frame, not at a URL of the message, and the
 * frames' files are still those the parser read. A frame of the stack equal to one of those
 * lines, function, file, line and column, goes with them: a cost the project accepts. A line
 * without a file is compared without it (`readAs`): the parser gives its frame the file of
 * another line, which no comparison of files could tell.
 * Only as far as the stack's text holds this message: when it does not (a `message` changed
 * after `stack` was read, an empty `name`), a frame read from a line of the stack's own copy
 * may go out, and with a file of the build, its function's name.
 */
export function messagesWithoutFrames(parse: ParseStack) {
  return <E extends Event>(event: E): E => {
    for (const exception of event.exception?.values ?? []) {
      if (typeof exception.value !== "string") continue;
      const [first = "", ...rest] = exception.value.split("\n");
      const read = rest.map((line) => framesOf(parse, line));
      exception.value = [first, ...rest.filter((_, index) => read[index].length === 0)].join("\n");
      const fromMessage = read.flat();
      const { stacktrace } = exception;
      if (stacktrace?.frames) stacktrace.frames = stacktrace.frames.filter((frame) => !fromMessage.some((read) => readAs(read)(frame)));
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
