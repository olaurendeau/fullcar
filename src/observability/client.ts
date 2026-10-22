import type * as Sentry from "@sentry/nextjs";
import { codeFramesOnly, exactIntegrations, registerHooks, sentryOptions, type SentryEnv } from "./options";
import { scrubText } from "./scrub";

/*
 * Sentry in the browser, started by `src/instrumentation-client.ts`. Without a DSN, `load`
 * is never called: the SDK is neither downloaded nor initialised.
 */

export type BrowserSdk = Pick<typeof Sentry, "init" | "browserTracingIntegration" | "captureRouterTransitionStart">;
type Load = () => Promise<BrowserSdk>;

/**
 * The browser's variables, each written out in full: Next.js inlines `process.env.NEXT_PUBLIC_…`
 * at build time, by name only.
 */
export function browserEnv(): SentryEnv {
  return {
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV,
  };
}

/** Errors, breadcrumbs, the request's URL, the frames of the build, and our page loads and navigations. */
export const BROWSER_INTEGRATIONS = [
  "EventFilters", "FunctionToString", "BrowserApiErrors", "Breadcrumbs", "GlobalHandlers", "LinkedErrors",
  "Dedupe", "HttpContext", "NextjsClientStackFrameNormalization", "BrowserTracing",
] as const;

/** A page load or a navigation is named after the URL, the admin link among them. */
export function beforeStartSpan<O extends { name: string }>(options: O): O {
  return { ...options, name: scrubText(options.name) };
}

/** The SDK, once started; `undefined` without a DSN, and `load` then never called. */
export async function startBrowserSentry(env: SentryEnv, load: Load = () => import("@sentry/nextjs")): Promise<BrowserSdk | undefined> {
  const options = sentryOptions(env);
  if (!options) return undefined;
  const sentry = await load();
  const tracing = sentry.browserTracingIntegration({ beforeStartSpan });
  const client = sentry.init({
    ...options,
    // Errors of our own scripts only, not of an extension or of another origin.
    allowUrls: [/\/_next\//],
    integrations: exactIntegrations(BROWSER_INTEGRATIONS, [tracing]),
  });
  if (!client) return undefined;
  registerHooks(client);
  client.addEventProcessor(codeFramesOnly);
  return sentry;
}
