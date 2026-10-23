/*
 * The place field's request (docs/design/place-autocomplete/, v5, « Quand une requête part »):
 * `POST /api/lieux` 300 ms after the last keystroke, the text in the JSON body and never in a
 * URL, one at a time per field, 3 s at most. What it answers is `place-field-state.ts`'s to
 * read: `ok`, with or without suggestions, or `unavailable`.
 */
import { positionOf } from "@/domain/place";
import type { PlaceQuery, Suggestion } from "@/domain/suggestion";

export type PlaceSearchResult = { state: "ok"; suggestions: Suggestion[] } | { state: "unavailable" };

/** The pause after the last keystroke. */
export const PAUSE_MS = 300;
/** Without an answer by then: « Recherche de propositions… ». */
export const SEARCHING_MS = 1_000;
/** Without an answer by then, the request is abandoned: unavailable. */
export const TIMEOUT_MS = 3_000;

const UNAVAILABLE: PlaceSearchResult = { state: "unavailable" };

export interface PlaceSearchDeps {
  fetch: typeof fetch;
  /** `navigator.onLine`: false, no request. */
  onLine: () => boolean;
}

export interface PlaceSearchHandlers {
  /** The answer for `text`, the field's text when it was typed. */
  answered: (text: string, result: PlaceSearchResult) => void;
  /** 1 s without the answer for `text`. */
  searching: (text: string) => void;
}

/** A suggestion as the route answers it, or `undefined`: a label and a position within the bounds. */
function suggestionOf(value: unknown): Suggestion | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { label, lat, lng } = value as Record<string, unknown>;
  const position = positionOf({ lat, lng });
  if (typeof label !== "string" || label === "" || "error" in position || position.value === null) return undefined;
  return { label, ...position.value };
}

/**
 * The body of the route's 200, `null` for anything else (another status, a body that is not
 * JSON, the network gone): anything but `ok` with a list of readable suggestions is unavailable.
 */
function resultOf(body: unknown): PlaceSearchResult {
  if (typeof body !== "object" || body === null) return UNAVAILABLE;
  const { state, suggestions } = body as Record<string, unknown>;
  if (state !== "ok" || !Array.isArray(suggestions)) return UNAVAILABLE;
  const read = suggestions.map(suggestionOf);
  return read.every((each) => each !== undefined) ? { state: "ok", suggestions: read } : UNAVAILABLE;
}

/** The body of the request: `near` only when there is one. */
function bodyOf({ text, locale, near }: PlaceQuery): string {
  return JSON.stringify(near ? { text, locale, near } : { text, locale });
}

/**
 * One field's search. Each keystroke restarts the pause and abandons the request out, which then
 * gives nothing; `query` null asks nothing. `stop` abandons both, when the field goes.
 */
export function createPlaceSearch({ fetch, onLine }: PlaceSearchDeps, { answered, searching }: PlaceSearchHandlers) {
  let cancel = () => {};

  function ask(text: string, query: PlaceQuery) {
    if (!onLine()) {
      answered(text, UNAVAILABLE);
      return;
    }
    const controller = new AbortController();
    /** Once answered, abandoned or past 3 s, the request gives nothing more, whether its `fetch` heeds its signal or not. */
    let over = false;
    const end = () => {
      over = true;
      clearTimeout(slow);
      clearTimeout(timeout);
      controller.abort();
    };
    const slow = setTimeout(() => searching(text), SEARCHING_MS);
    const timeout = setTimeout(() => {
      end();
      answered(text, UNAVAILABLE);
    }, TIMEOUT_MS);
    cancel = end;
    fetch("/api/lieux", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bodyOf(query),
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null)
      .then((body: unknown) => {
        if (over) return;
        end();
        answered(text, resultOf(body));
      });
  }

  return {
    typed(text: string, query: PlaceQuery | null) {
      cancel();
      cancel = () => {};
      if (query === null) return;
      const pause = setTimeout(() => ask(text, query), PAUSE_MS);
      cancel = () => clearTimeout(pause);
    },
    stop() {
      cancel();
      cancel = () => {};
    },
  };
}
