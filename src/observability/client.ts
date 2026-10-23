import type * as Sentry from "@sentry/nextjs";
import { codeFramesOnly, exactIntegrations, messagesWithoutFrames, registerHooks, sentryOptions, type SentryEnv } from "./options";
import { RUNTIME_FILES, scrubText } from "./scrub";

/*
 * Sentry in the browser, started by `src/instrumentation-client.ts`. Without a DSN, `load`
 * is never called: the SDK is neither downloaded nor initialised.
 */

export type BrowserSdk = Pick<
  typeof Sentry, "init" | "browserTracingIntegration" | "captureRouterTransitionStart" | "defaultStackParser"
>;
type Load = () => Promise<BrowserSdk>;
type StackParser = BrowserSdk["defaultStackParser"];

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

/** The file of a script's frame: a URL, without a space (`https://…`, `chrome-extension://…`, `blob:…`). */
const SCRIPT_FILE = /^[a-z][\w+.-]*:\S+$/i;

/**
 * The SDK's stack parser, without the frames it reads from a line of a message (#379). V8
 * writes the message at the top of the stack: `    at Marc (depuis 10:30)` would be the
 * thrown error's top frame, the only one `allowUrls` looks at, and the error never sent.
 * A stack without a frame of a script keeps its frames: `allowUrls` then drops it, as before.
 * The frames of the runtime stay with those of scripts (#395): `allowUrls` skips them, and
 * `codeFramesOnly` keeps those of a built-in alone.
 */
export function scriptFramesOnly(parse: StackParser): StackParser {
  return (...args) => {
    const frames = parse(...args);
    const script = ({ filename }: (typeof frames)[number]) => SCRIPT_FILE.test(filename ?? "");
    return frames.some(script) ? frames.filter((frame) => script(frame) || RUNTIME_FILES.has(frame.filename)) : frames;
  };
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
    stackParser: scriptFramesOnly(sentry.defaultStackParser),
    integrations: exactIntegrations(BROWSER_INTEGRATIONS, [tracing]),
  });
  if (!client) return undefined;
  registerHooks(client);
  client.addEventProcessor(codeFramesOnly);
  // The SDK's parser as it is: a line it makes a frame of leaves the message, URL or not.
  client.addEventProcessor(messagesWithoutFrames(sentry.defaultStackParser));
  return sentry;
}
