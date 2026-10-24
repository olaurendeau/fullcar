/**
 * The slot's fake IGN (e2e/fake-ign.mjs), set from a test through its control port.
 * It is set by tile, `z/x/y` as Leaflet and `/tuiles/{z}/{x}/{y}` name it, never for all
 * tiles: the tests run in parallel. It keeps what it is told and what it receives for as
 * long as it runs, so each test takes its tiles around its own seeded event (`tileOf` in e2e/tiles.ts).
 */

/**
 * What the fake answers to a tile: by default (`tile`) a small PNG; `notFound`, the real
 * service's 404 report (e2e/ign-not-found.xml), byte for byte; `notFoundBare`, a 404 without
 * that report; `invalidParameter`, a 400 `InvalidParameterValue` report; `forbidden` (403),
 * `tooMany` (429), `error` (500). `delayMs` delays it, whatever it is, 2³¹ − 1 ms at most:
 * Node would cut a longer timer to 1 ms.
 */
export type IgnAnswer = {
  kind?: "tile" | "notFound" | "notFoundBare" | "invalidParameter" | "forbidden" | "tooMany" | "error";
  delayMs?: number;
};

/** A request the fake received: its path, its query as sent, and its headers (lower case). */
export type IgnRequest = { path: string; query: string; headers: Record<string, string | undefined> };

function controlUrl(path: string) {
  const base = process.env.IGN_CONTROL_URL;
  if (!base) throw new Error("e2e: IGN_CONTROL_URL is not set");
  return new URL(path, base);
}

/** From now on, the fake answers `answer` to each of `tiles` (`z/x/y`), and to them only. */
export async function answerTiles(tiles: string[], answer: IgnAnswer): Promise<void> {
  const response = await fetch(controlUrl("/answers"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tiles, answer }),
  });
  if (response.status !== 204) throw new Error(`e2e: the fake IGN refused the answer (${response.status})`);
}

/** The requests the fake received for the tile `tile` (`z/x/y`), oldest first. */
export async function requestsForTile(tile: string): Promise<IgnRequest[]> {
  const url = controlUrl("/requests");
  url.searchParams.set("tile", tile);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`e2e: the fake IGN did not list its requests (${response.status})`);
  return response.json();
}
