/**
 * `GET /tuiles/{z}/{x}/{y}` (event-map v27, « Les tuiles », CA2.6, CA3.2): Geoapify's answer,
 * translated into what the browser and Vercel's CDN keep. Nothing of the visitor's request is
 * read: neither its headers nor its query reach this function.
 */
import { tileOf } from "@/domain/tile";
import type { Geoapify } from "./geoapify";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * A tile: 200 `image/png`, a day in the browser, 30 days at the CDN. Everything else: 502,
 * empty, stored nowhere, which Leaflet reads as a `tileerror`; never a transparent PNG.
 * Coordinates that are not a tile: 404, stored nowhere, without a call.
 */
export async function handleTile(params: { z: string; x: string; y: string }, geoapify: Geoapify): Promise<Response> {
  const tile = tileOf(params);
  if (tile === null) return new Response(null, { status: 404, headers: NO_STORE });
  const answer = await geoapify.tile(tile);
  if (answer.state === "failed") return new Response(null, { status: 502, headers: NO_STORE });
  return new Response(answer.png, {
    status: 200,
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400", "CDN-Cache-Control": "public, s-maxage=2592000" },
  });
}
