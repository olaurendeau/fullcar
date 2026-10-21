import type { addIntegration, getClient, NodeOptions } from "@sentry/nextjs";
import { scrubBreadcrumb, scrubCreatedDsc, scrubDsc, scrubEvent, scrubSpan } from "./scrub";

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
