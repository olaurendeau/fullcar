import type * as Sentry from "@sentry/nextjs";
import { errorCode } from "@/db/failure";
import {
  codeFramesOnly, exactIntegrations, messagesWithoutFrames, registerHooks, sentryOptions, type SentryEnv,
} from "./options";

/*
 * Sentry on the server (Node.js runtime), started by `register()` in `src/instrumentation.ts`.
 * Without a DSN, `load` is never called: the SDK is neither imported nor initialised.
 */

export type ServerSdk = Pick<typeof Sentry, "init" | "httpIntegration" | "captureRequestError">;
type Load = () => Promise<ServerSdk>;
const loadSdk: Load = () => import("@sentry/nextjs");

/** The server's variables: Vercel names the commit and the environment without a prefix. */
export function serverEnv(env: Record<string, string | undefined> = process.env): SentryEnv {
  return {
    dsn: env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
    release: env.VERCEL_GIT_COMMIT_SHA,
    environment: env.VERCEL_ENV,
  };
}

/*
 * Of the integrations Next.js installs on the server, those of an error and of a request:
 * not ProcessSession, nor Http's sessions (no sessions); not Console, Modules, LocalVariables,
 * ChildProcess, WorkerThreads, ConversationId; and of the tracing ones, Postgres alone.
 */
export const SERVER_INTEGRATIONS = [
  "EventFilters", "FunctionToString", "LinkedErrors", "Dedupe", "RequestData", "NodeSystemError",
  "Http", "OnUncaughtException", "OnUnhandledRejection", "Context", "Postgres", "DistDirRewriteFrames",
] as const;

/**
 * An error of the database or of the system: `database error (SQLSTATE x)` and nothing of its
 * message, which may quote a value, as `databaseFailure` logs it (`src/db/failure.ts`).
 */
export function databaseErrors<E extends Sentry.Event>(event: E, hint: Sentry.EventHint): E {
  const code = errorCode(hint.originalException);
  const values = event.exception?.values;
  if (!code || !values?.length) return event;
  // The thrown error is the last one: its causes come before it.
  values[values.length - 1].value = `database error (${code})`;
  return event;
}

/**
 * The hooks of `registerHooks`, and the server's event processors. The client's stack parser
 * is the SDK's own, `defaultStackParser`: the one that made the frames of every error.
 */
export function registerServerHooks(client: Pick<Sentry.NodeClient, "on" | "addEventProcessor" | "getOptions">): void {
  registerHooks(client);
  client.addEventProcessor(codeFramesOnly);
  client.addEventProcessor(messagesWithoutFrames(client.getOptions().stackParser));
  client.addEventProcessor(databaseErrors);
}

export async function startServerSentry(env: SentryEnv, load: Load = loadSdk): Promise<void> {
  const options = sentryOptions(env);
  if (!options) return;
  const sentry = await load();
  // Next.js already makes the spans of incoming requests.
  const http = sentry.httpIntegration({ disableIncomingRequestSpans: true, sessions: false });
  const client = sentry.init({ ...options, integrations: exactIntegrations(SERVER_INTEGRATIONS, [http]) });
  if (!client) return;
  registerServerHooks(client);
}

/** `onRequestError`: reported only with a DSN, the SDK loaded only then. */
export async function reportRequestError(
  env: SentryEnv,
  args: Parameters<ServerSdk["captureRequestError"]>,
  load: Load = loadSdk,
): Promise<void> {
  if (!sentryOptions(env)) return;
  (await load()).captureRequestError(...args);
}
