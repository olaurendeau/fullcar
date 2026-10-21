import type { Instrumentation } from "next";

/*
 * Sentry on the server, only with a DSN (#234): `src/observability/server.ts` imports the SDK
 * then, and only then. The Node.js runtime alone: the edge runtime is out of scope (#231).
 */

const nodejs = () => process.env.NEXT_RUNTIME === "nodejs";

export async function register(): Promise<void> {
  if (!nodejs()) return;
  const { serverEnv, startServerSentry } = await import("@/observability/server");
  await startServerSentry(serverEnv());
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!nodejs()) return;
  const { reportRequestError, serverEnv } = await import("@/observability/server");
  await reportRequestError(serverEnv(), args);
};
