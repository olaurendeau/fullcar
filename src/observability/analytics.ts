import type { BeforeSendEvent } from "@vercel/analytics/next";

/*
 * What may leave for Vercel Web Analytics (#346): the origin and the route of a page, never
 * an event's id, the token of a fragment (`/e/{id}/admin#{token}`) or a query. Pure: only
 * types come from the package.
 *
 * `beforeSend` sees only the URL. The script also sends `dp`, the route that the package
 * computes from Next's params (`computeRoute`: each param's value in the path becomes
 * `[name]`, and on a page without params, each query value does). It never goes through
 * here. It is safe for the four routes below: `/e/[id]` and `/e/[id]/admin` have `id` as their
 * only param, and `/` and `/nouveau` have no data in their path. A new page with a dynamic
 * segment must be checked against `computeRoute` before it joins `ROUTES`.
 */

/** The application's pages, and the route each is sent as; any other path is not sent. */
const ROUTES: [RegExp, string][] = [
  [/^\/$/, "/"],
  [/^\/nouveau$/, "/nouveau"],
  [/^\/e\/[^/]+$/, "/e/[id]"],
  [/^\/e\/[^/]+\/admin$/, "/e/[id]/admin"],
];

/** The route of `pathname`, or `undefined` for a path that is none of the application's pages. */
function routeOf(pathname: string): string | undefined {
  return ROUTES.find(([path]) => path.test(pathname))?.[1];
}

/**
 * A page view rebuilt from its URL's origin and route: the query and the fragment are left
 * out. `null`, which the script drops, for a custom event (the application sends none), a
 * URL it cannot read, or a path that is none of the application's pages.
 */
export function analyticsBeforeSend(event: BeforeSendEvent): BeforeSendEvent | null {
  if (event.type !== "pageview") return null;
  // Not `URL.canParse`: Safari 16.4 to 16.x and Chrome 111 to 119, which Next supports, lack it.
  let url: URL;
  try {
    url = new URL(event.url);
  } catch {
    return null;
  }
  const route = routeOf(url.pathname);
  return route === undefined ? null : { type: "pageview", url: `${url.origin}${route}` };
}
