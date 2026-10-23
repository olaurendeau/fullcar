/**
 * `GET /tuiles/{z}/{x}/{y}` (event-map v11, « Les tuiles », CA2.6, CA3.2): the IGN's answer,
 * translated into what the browser and Vercel's CDN keep. Nothing of the visitor's request is
 * read: neither its headers nor its query reach this function.
 */
import { tileOf } from "@/domain/tile";
import { BLANK_TILE } from "./blank-tile";
import type { Ign } from "./ign";

const NO_STORE = { "Cache-Control": "no-store" };
const ONE_DAY = "public, max-age=86400";

function png(body: Uint8Array<ArrayBuffer>, cache: Record<string, string>): Response {
  return new Response(body, { status: 200, headers: { "Content-Type": "image/png", ...cache } });
}

/**
 * A tile: a day in the browser, 30 days at the CDN. A missing tile: the blank tile, a day in
 * both. Any other 404: the blank tile, stored nowhere. A failure: 502, stored nowhere, the only
 * answer that raises Leaflet's `tileerror`. Coordinates that are not a tile: 404, without a call.
 */
export async function handleTile(params: { z: string; x: string; y: string }, ign: Ign): Promise<Response> {
  const tile = tileOf(params);
  if (tile === null) return new Response(null, { status: 404, headers: NO_STORE });
  const answer = await ign.tile(tile);
  switch (answer.state) {
    case "tile":
      return png(answer.png, { "Cache-Control": ONE_DAY, "CDN-Cache-Control": "public, s-maxage=2592000" });
    case "absent":
      return png(BLANK_TILE, { "Cache-Control": ONE_DAY, "CDN-Cache-Control": "public, s-maxage=86400" });
    case "blank":
      return png(BLANK_TILE, NO_STORE);
    case "failed":
      return new Response(null, { status: 502, headers: NO_STORE });
  }
}
