/**
 * The call to Photon behind `POST /api/lieux` (place-autocomplete, « La route et Photon »): a
 * good citizen of komoot's public instance, which promises nothing. An instance per module,
 * so per server instance: its cache, its cap and its breaker live as long as it does.
 *
 * Photon sees our User-Agent and the query, nothing of the visitor: the search receives a
 * `PlaceQuery`, never the visitor's request. No log carries the text, the URL or the answer,
 * and nothing is thrown: a failure is `unavailable`, a normal state (D2).
 */
import { retryAfterMs } from "@/domain/retry-after";
import { cacheKey, photonQuery, suggestionsOf, type PlaceQuery, type Suggestion } from "@/domain/suggestion";
// Read at build time, never written: the User-Agent names the version deployed.
import packageJson from "../../../../package.json";

export type PhotonAnswer = { state: "ok"; suggestions: Suggestion[] } | { state: "unavailable" };

export interface Photon {
  search(query: PlaceQuery): Promise<PhotonAnswer>;
}

export interface PhotonOptions {
  fetch: typeof fetch;
  /** In milliseconds, as `Date.now`. */
  now: () => number;
  /** Photon's search endpoint, `PHOTON_URL`. */
  url: string;
  /** How long the breaker stays open, `PLACES_BREAKER_MS`; `0` never opens it, `Retry-After` included. */
  breakerMs: number;
}

const PHOTON_URL = "https://photon.komoot.io/api/";
const BREAKER_MS = 60_000;
/** However long `Retry-After` asks: an instance does not give up on Photon for longer. */
const MAX_BREAKER_MS = 3_600_000;

const USER_AGENT = `fullcar/${packageJson.version} (+https://github.com/olaurendeau/fullcar)`;

const CACHE_ENTRIES = 500;
const CACHE_MS = 3_600_000;
const CALLS_PER_SECOND = 5;
const TIMEOUT_MS = 3_000;
/** Five suggestions take a few kilobytes: beyond, the answer is not Photon's. */
const MAX_BYTES = 65_536;
/** Photon is asked for 5: `suggestionsOf` never looks further than this, whatever comes. */
const MAX_FEATURES = 20;

const UNAVAILABLE: PhotonAnswer = { state: "unavailable" };

/** `PHOTON_URL` and `PLACES_BREAKER_MS` (an integer of milliseconds), each with its default when unset or unreadable. */
export function photonSettings(env: Record<string, string | undefined>): Pick<PhotonOptions, "url" | "breakerMs"> {
  const breaker = env.PLACES_BREAKER_MS ?? "";
  return { url: env.PHOTON_URL || PHOTON_URL, breakerMs: /^\d+$/.test(breaker) ? Number(breaker) : BREAKER_MS };
}

/** Why a call failed, as it is logged: a fixed word, or the HTTP status. */
type Failure = { status: number } | "timeout" | "no answer" | "unreadable answer" | "answer too large";

class Unavailable {
  constructor(readonly failure: Failure) {}
}

export function createPhoton({ fetch, now, url, breakerMs }: PhotonOptions): Photon {
  /** Oldest first: Map keeps its insertion order, and a hit moves its entry to the end. */
  const cache = new Map<string, { at: number; suggestions: Suggestion[] }>();
  const calls: number[] = [];
  let openUntil = 0;

  function cached(key: string): Suggestion[] | undefined {
    const entry = cache.get(key);
    if (!entry) return undefined;
    cache.delete(key);
    if (now() - entry.at >= CACHE_MS) return undefined;
    cache.set(key, entry);
    return entry.suggestions;
  }

  function keep(key: string, suggestions: Suggestion[]) {
    cache.set(key, { at: now(), suggestions });
    if (cache.size > CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
  }

  /** Room for one more call in the last second, which it takes. */
  function underCap(): boolean {
    const time = now();
    while (calls.length > 0 && calls[0] <= time - 1000) calls.shift();
    if (calls.length >= CALLS_PER_SECOND) return false;
    calls.push(time);
    return true;
  }

  /** For `Retry-After`, or `breakerMs`, but never less than `breakerMs` nor more than an hour. */
  function open(retryAfter: string | null) {
    if (breakerMs === 0) return;
    const ms = Math.min(Math.max(retryAfterMs(retryAfter, now()) ?? breakerMs, breakerMs), MAX_BREAKER_MS);
    // A failure that comes back late does not shorten what an earlier one opened.
    openUntil = Math.max(openUntil, now() + ms);
  }

  async function call(query: PlaceQuery): Promise<Suggestion[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(photonQuery(url, query), {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        // Next's data cache would keep the answer, keyed by the URL that holds the text.
        cache: "no-store",
        // A redirect would carry the text to whatever host it names.
        redirect: "error",
        signal: controller.signal,
      });
      if (response.status === 429 || response.status >= 500) open(response.headers.get("Retry-After"));
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        throw new Unavailable({ status: response.status });
      }
      const suggestions = suggestionsOf(parsed(await bodyOf(response, controller.signal)));
      if (suggestions === null) throw new Unavailable("unreadable answer");
      return suggestions;
    } catch (error) {
      if (error instanceof Unavailable || !controller.signal.aborted) throw error;
      open(null);
      throw new Unavailable("timeout");
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async search(query) {
      try {
        const key = cacheKey(query);
        const hit = cached(key);
        if (hit) return { state: "ok", suggestions: hit };
        if (now() < openUntil || !underCap()) return UNAVAILABLE;
        const suggestions = await call(query);
        keep(key, suggestions);
        return { state: "ok", suggestions };
      } catch (error) {
        // Any other error is not looked at: its message or its cause may hold the URL.
        const failure = error instanceof Unavailable ? error.failure : "no answer";
        console.error(`photon: unavailable (${typeof failure === "string" ? failure : `HTTP ${failure.status}`})`);
        return UNAVAILABLE;
      }
    },
  };
}

/** The body as text, read up to `MAX_BYTES`, and no further. */
async function bodyOf(response: Response, signal: AbortSignal): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
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
      if (size > MAX_BYTES) {
        stop();
        throw new Unavailable("answer too large");
      }
      chunks.push(value);
    }
    return new TextDecoder().decode(Buffer.concat(chunks));
  } finally {
    signal.removeEventListener("abort", stop);
  }
}

/** The JSON of the answer, its features cut to `MAX_FEATURES`; unreadable, `null`. */
function parsed(body: string): unknown {
  try {
    const json: unknown = JSON.parse(body);
    const features = typeof json === "object" && json !== null ? (json as { features?: unknown }).features : undefined;
    return Array.isArray(features) ? { ...(json as object), features: features.slice(0, MAX_FEATURES) } : json;
  } catch {
    return null;
  }
}
