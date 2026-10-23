/**
 * The call to Plan IGN v2 behind `GET /tuiles/{z}/{x}/{y}` (event-map v11, « Les tuiles »; #238,
 * the addendum v11, § 3). The IGN sees our User-Agent and the tile, nothing of the visitor: a
 * call receives a `Tile`, never the visitor's request.
 *
 * Four answers: a tile (200 `image/png`); a missing tile (a 404 with the OWS « Not Found »
 * report); any other 404 (no such report, unreadable, too large); a failure (everything else).
 * Nothing is thrown, and no log carries the tile or the URL: a tile says the area looked at.
 */
import { isNotFoundReport, wmtsTileUrl, type Tile } from "@/domain/tile";
// Read at build time, never written: the User-Agent names the version deployed.
import packageJson from "../../../../../../package.json";

export type IgnAnswer =
  | { state: "tile"; png: Uint8Array<ArrayBuffer> }
  | { state: "absent" }
  | { state: "blank" }
  | { state: "failed" };

export interface Ign {
  tile(tile: Tile): Promise<IgnAnswer>;
}

export interface IgnOptions {
  fetch: typeof fetch;
  /** The WMTS endpoint, `IGN_WMTS_URL`. */
  url: string;
}

const IGN_WMTS_URL = "https://data.geopf.fr/wmts";
const USER_AGENT = `fullcar/${packageJson.version} (+https://github.com/olaurendeau/fullcar)`;
const TIMEOUT_MS = 5_000;
/** A tile of the survey weighs 88 KB; an RGBA tile of 256 × 256 that does not compress, 263 KB. */
const MAX_TILE_BYTES = 524_288;
/** `isNotFoundReport` reads 4 096 characters at most; the real report is 138 bytes. */
const MAX_REPORT_BYTES = 4_096;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** `IGN_WMTS_URL`, the Géoplateforme's public WMTS when unset or empty. */
export function ignSettings(env: Record<string, string | undefined>): Pick<IgnOptions, "url"> {
  return { url: env.IGN_WMTS_URL || IGN_WMTS_URL };
}

/** Why a call failed, as it is logged: a fixed word, or the HTTP status. */
type Failure = { status: number } | "timeout" | "no answer" | "not a PNG" | "answer too large";

class Failed {
  constructor(readonly failure: Failure) {}
}

class TooLarge {}

export function createIgn({ fetch, url }: IgnOptions): Ign {
  async function call(tile: Tile): Promise<IgnAnswer> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(wmtsTileUrl(url, tile), {
        headers: { "User-Agent": USER_AGENT, Accept: "image/png" },
        // The cache is the CDN's, not Next's data cache.
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      if (response.status === 404) return (await notFound(response, controller.signal)) ? { state: "absent" } : blank();
      if (response.status !== 200) {
        void response.body?.cancel().catch(() => {});
        throw new Failed({ status: response.status });
      }
      if (!isPngType(response.headers.get("Content-Type"))) {
        void response.body?.cancel().catch(() => {});
        throw new Failed("not a PNG");
      }
      const png = await bodyOf(response, controller.signal, MAX_TILE_BYTES).catch((error: unknown) => {
        throw error instanceof TooLarge ? new Failed("answer too large") : error;
      });
      if (!PNG_SIGNATURE.every((byte, at) => png[at] === byte)) throw new Failed("not a PNG");
      return { state: "tile", png };
    } catch (error) {
      if (error instanceof Failed || !controller.signal.aborted) throw error;
      throw new Failed("timeout");
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async tile(tile) {
      try {
        return await call(tile);
      } catch (error) {
        // Any other error is not looked at: its message or its cause may hold the URL.
        const failure = error instanceof Failed ? error.failure : "no answer";
        console.error(`ign: tile failed (${typeof failure === "string" ? failure : `HTTP ${failure.status}`})`);
        return { state: "failed" };
      }
    },
  };
}

function blank(): IgnAnswer {
  console.error("ign: blank tile (HTTP 404 without a Not Found report)");
  return { state: "blank" };
}

/**
 * Whether a 404's body is the « Not Found » report. Too large, broken or not UTF-8, it is not:
 * no tile stays blank a day in the CDN's cache on a doubt (addendum v11). The delay is not a
 * doubt but a failure, and is thrown as such.
 */
async function notFound(response: Response, signal: AbortSignal): Promise<boolean> {
  try {
    const bytes = await bodyOf(response, signal, MAX_REPORT_BYTES);
    return isNotFoundReport(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    if (signal.aborted) throw error;
    return false;
  }
}

/** `image/png`, in any case, with or without parameters. */
function isPngType(contentType: string | null): boolean {
  return contentType?.split(";", 1)[0].trim().toLowerCase() === "image/png";
}

/** The body, read up to `limit` bytes, and no further: beyond, `TooLarge` is thrown. */
async function bodyOf(response: Response, signal: AbortSignal, limit: number): Promise<Uint8Array<ArrayBuffer>> {
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
      if (size > limit) {
        stop();
        throw new TooLarge();
      }
      chunks.push(value);
    }
    return Uint8Array.from(Buffer.concat(chunks));
  } finally {
    signal.removeEventListener("abort", stop);
  }
}
