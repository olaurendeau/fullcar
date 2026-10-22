import type * as Sentry from "@sentry/nextjs";
import { codeFramesOnly, exactIntegrations, registerHooks, sentryOptions, type SentryEnv } from "./options";
import { scrubText } from "./scrub";

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
 */
export function scriptFramesOnly(parse: StackParser): StackParser {
  return (...args) => {
    const frames = parse(...args);
    const scripts = frames.filter(({ filename }) => SCRIPT_FILE.test(filename ?? ""));
    return scripts.length > 0 ? scripts : frames;
  };
}

/** A line of a stack: V8's `    at …`, SpiderMonkey's and JavaScriptCore's `name@file:line:column`. */
const FRAME_LINE = /^\s*at\s|^\s*[^\s@]*@.*:\d+(?::\d+)?\s*$/;

/**
 * Of every error's message, and of its causes', the lines after the first that read as a
 * frame (#379): `scriptFramesOnly` leaves out the frame made of such a line, and this the
 * line itself, which `scrubText` would send with the first name in it.
 */
export function messagesWithoutFrames<E extends Sentry.Event>(event: E): E {
  for (const exception of event.exception?.values ?? []) {
    if (typeof exception.value !== "string") continue;
    exception.value = exception.value.split("\n").filter((line, index) => index === 0 || !FRAME_LINE.test(line)).join("\n");
  }
  return event;
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
  client.addEventProcessor(messagesWithoutFrames);
  return sentry;
}
