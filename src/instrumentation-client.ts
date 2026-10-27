import { sheetHistory } from "@/components/event/sheet-history";
import type { BrowserSdk } from "@/observability/client";

/*
 * Sentry in the browser, only with a DSN (#234). The condition is written out in full so that
 * Next.js inlines it at build time: without a DSN, the code below and the SDK are not in the
 * bundle at all.
 */

let sentry: BrowserSdk | undefined;

// Before the App Router listens to `popstate`: a step back between a sheet's entries never reaches it (event-board v4.7).
if (typeof window !== "undefined") sheetHistory();

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  void import("@/observability/client")
    .then(({ browserEnv, startBrowserSentry }) => startBrowserSentry(browserEnv()))
    .then((started) => {
      sentry = started;
    })
    // A chunk that does not load (network down, blocked): the page goes on as without a DSN.
    .catch(() => undefined);
}

/** A navigation of the App Router: nothing is passed on until the SDK has loaded. */
export function onRouterTransitionStart(href: string, navigationType: string): void {
  sentry?.captureRouterTransitionStart(href, navigationType);
}
