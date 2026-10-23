import { handlePlaces } from "./handle";
import { createPhoton, photonSettings } from "./photon";

/*
 * One Photon per server instance: its cache, its cap and its breaker are this module's. Only
 * `POST` is exported, and Next answers 405 to any other method.
 */
const photon = createPhoton({
  // Looked up at each call: Next patches `fetch` on the server.
  fetch: (input, init) => fetch(input, init),
  now: Date.now,
  ...photonSettings(process.env),
});

export function POST(request: Request): Promise<Response> {
  return handlePlaces(request, photon);
}
