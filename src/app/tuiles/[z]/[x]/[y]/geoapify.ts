/**
 * The call to Geoapify behind `GET /tuiles/{z}/{x}/{y}` (event-map v20, « Les tuiles »; #549):
 * a raster tile, `positron` @2x by default. Geoapify sees our User-Agent, our key and the tile,
 * nothing of the visitor: a call receives a `Tile`, never the visitor's request.
 *
 * Two answers: a tile (a 200 `image/png` that is a PNG), or a failure (everything else).
 * Nothing is thrown, and no log carries the key, the URL or the tile: a tile says the area
 * looked at. An instance per module, so per server instance: its breaker lives as long as it does.
 */
import { retryAfterMs } from "@/domain/retry-after";
import type { Tile } from "@/domain/tile";
// Read at build time, never written: the User-Agent names the version deployed.
import packageJson from "../../../../../../package.json";

export type TileAnswer = { state: "tile"; png: Uint8Array<ArrayBuffer> } | { state: "failed" };

export interface Geoapify {
  tile(tile: Tile): Promise<TileAnswer>;
}

export interface GeoapifyOptions {
  fetch: typeof fetch;
  /** In milliseconds, as `Date.now`. */
  now: () => number;
  /** The tiles' endpoint, `TILE_UPSTREAM_URL`; its own query and fragment are dropped. */
  url: string;
  /** The map style, `TILE_STYLE`. */
  style: string;
  /** `GEOAPIFY_API_KEY`; empty, there is no key and no call. */
  key: string;
  /** How long the breaker stays open, `TILES_BREAKER_MS`; `0` never opens it, `Retry-After` included. */
  breakerMs: number;
}

const TILE_UPSTREAM_URL = "https://maps.geoapify.com/v1/tile";
const TILE_STYLE = "positron";
/** A style is one path segment: a setting cannot change the rest of the path. */
const STYLE = /^[a-z0-9-]+$/;
/** Geoapify's limit is per second: a minute without a map for a `Retry-After: 1` would be too long. */
const BREAKER_MS = 10_000;
/** However long `Retry-After` asks: an instance does not give up on Geoapify for longer. */
const MAX_BREAKER_MS = 3_600_000;

const USER_AGENT = `fullcar/${packageJson.version} (+https://github.com/olaurendeau/fullcar)`;
const TIMEOUT_MS = 5_000;
/** A tile of 512 × 512 that does not compress is about 1 MiB: beyond twice that, it is not a tile. */
const MAX_TILE_BYTES = 2_097_152;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const FAILED: TileAnswer = { state: "failed" };

/**
 * `TILE_UPSTREAM_URL`, `TILE_STYLE`, `GEOAPIFY_API_KEY` and `TILES_BREAKER_MS` (an integer of
 * milliseconds, digits only), each with its default when unset, empty or unreadable.
 */
export function geoapifySettings(env: Record<string, string | undefined>): Omit<GeoapifyOptions, "fetch" | "now"> {
  const style = env.TILE_STYLE ?? "";
  const breaker = env.TILES_BREAKER_MS ?? "";
  return {
    url: env.TILE_UPSTREAM_URL || TILE_UPSTREAM_URL,
    style: STYLE.test(style) ? style : TILE_STYLE,
    key: env.GEOAPIFY_API_KEY ?? "",
    breakerMs: /^\d+$/.test(breaker) ? Number(breaker) : BREAKER_MS,
  };
}

/** `{url}/{style}/{z}/{x}/{y}@2x.png?apiKey={key}`, the base without its query, fragment or trailing slash. */
function tileUrl(url: string, style: string, key: string, { z, x, y }: Tile): string {
  const base = url.split(/[?#]/, 1)[0].replace(/\/+$/, "");
  return `${base}/${style}/${z}/${x}/${y}@2x.png?apiKey=${encodeURIComponent(key)}`;
}

/** Why a call failed, as it is logged: a fixed word, or the HTTP status. */
type Failure = { status: number } | "timeout" | "no answer" | "not a PNG" | "answer too large";

class Failed {
  constructor(readonly failure: Failure) {}
}

export function createGeoapify({ fetch, now, url, style, key, breakerMs }: GeoapifyOptions): Geoapify {
  let openUntil = 0;

  /** For `Retry-After`, or `breakerMs`, but never less than `breakerMs` nor more than an hour. */
  function open(retryAfter: string | null) {
    if (breakerMs === 0) return;
    const ms = Math.min(Math.max(retryAfterMs(retryAfter, now()) ?? breakerMs, breakerMs), MAX_BREAKER_MS);
    // A failure that comes back late does not shorten what an earlier one opened.
    openUntil = Math.max(openUntil, now() + ms);
  }

  async function call(tile: Tile): Promise<Uint8Array<ArrayBuffer>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(tileUrl(url, style, key, tile), {
        headers: { "User-Agent": USER_AGENT, Accept: "image/png" },
        // The cache is the CDN's, not Next's data cache, which would key it by the URL that holds the key.
        cache: "no-store",
        // A redirect would carry the key to whatever host it names.
        redirect: "error",
        signal: controller.signal,
      });
      // Only a limit opens the breaker: a 5xx is not one (event-map v20, CA3.6).
      if (response.status === 429) open(response.headers.get("Retry-After"));
      if (response.status !== 200) {
        void response.body?.cancel().catch(() => {});
        throw new Failed({ status: response.status });
      }
      if (!isPngType(response.headers.get("Content-Type"))) {
        void response.body?.cancel().catch(() => {});
        throw new Failed("not a PNG");
      }
      const png = await bodyOf(response, controller.signal);
      if (!PNG_SIGNATURE.every((byte, at) => png[at] === byte)) throw new Failed("not a PNG");
      return png;
    } catch (error) {
      if (error instanceof Failed || !controller.signal.aborted) throw error;
      throw new Failed("timeout");
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async tile(tile) {
      if (key === "") {
        console.error("tiles: no key");
        return FAILED;
      }
      if (now() < openUntil) return FAILED;
      try {
        return { state: "tile", png: await call(tile) };
      } catch (error) {
        // Any other error is not looked at: its message or its cause may hold the URL, and the key.
        const failure = error instanceof Failed ? error.failure : "no answer";
        console.error(`tiles: tile failed (${typeof failure === "string" ? failure : `HTTP ${failure.status}`})`);
        return FAILED;
      }
    },
  };
}

/** `image/png`, in any case, with or without parameters. */
function isPngType(contentType: string | null): boolean {
  return contentType?.split(";", 1)[0].trim().toLowerCase() === "image/png";
}

/** The body, read up to `MAX_TILE_BYTES`, and no further. */
async function bodyOf(response: Response, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  // A body that stalls: the abort ends the read, which a real fetch does by itself.
  const stop = () => void reader.cancel().catch(() => {});
  signal.addEventListener("abort", stop);
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (signal.aborted) throw signal.reason;
      if (done) break;
      size += value.byteLength;
      if (size > MAX_TILE_BYTES) {
        stop();
        throw new Failed("answer too large");
      }
      chunks.push(value);
    }
    return Uint8Array.from(Buffer.concat(chunks));
  } finally {
    signal.removeEventListener("abort", stop);
  }
}
