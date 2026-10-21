import type { BrowserSdk } from "@/observability/client";

/*
 * Sentry in the browser, only with a DSN (#234). The condition is written out in full so that
 * Next.js inlines it at build time: without a DSN, the code below and the SDK are not in the
 * bundle at all.
 */

let sentry: BrowserSdk | undefined;

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  void import("@/observability/client")
    .then(({ browserEnv, startBrowserSentry }) => startBrowserSentry(browserEnv()))
    .then((started) => {
      sentry = started;
    });
}

/** A navigation of the App Router: nothing is passed on until the SDK has loaded. */
export function onRouterTransitionStart(href: string, navigationType: string): void {
  sentry?.captureRouterTransitionStart(href, navigationType);
}
