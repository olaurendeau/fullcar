import { createGeoapify, geoapifySettings } from "./geoapify";
import { handleTile } from "./handle";

/*
 * One Geoapify client per server instance, so one breaker. Only `GET` is exported. Next answers
 * `HEAD` by calling it, so a `HEAD` the CDN has not cached calls Geoapify; `OPTIONS` with 204 and
 * `Allow: GET, HEAD, OPTIONS`; any other method with 405. The visitor's request is not passed
 * on: only the three segments are.
 */
const geoapify = createGeoapify({
  // Looked up at each call: Next patches `fetch` on the server.
  fetch: (input, init) => fetch(input, init),
  now: () => Date.now(),
  ...geoapifySettings(process.env),
});

export async function GET(_request: Request, { params }: { params: Promise<{ z: string; x: string; y: string }> }): Promise<Response> {
  return handleTile(await params, geoapify);
}
