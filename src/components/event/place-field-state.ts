/*
 * The place field (docs/design/place-autocomplete/, v5, « Cycle de vie » and « Quand une requête
 * part »): its text and position, its list, its line, what its `status` region says. The only
 * place that decides them: pure functions over a state the field keeps; its timers and its
 * request are `place-search.ts`.
 */
import type { Position } from "@/domain/place";
import { placeQueryOf, type PlaceQuery, type Suggestion } from "@/domain/suggestion";
import { text as readText } from "@/domain/text";
import type { Locale } from "@/i18n/locales";
import type { PlaceSearchResult } from "./place-search";

/**
 * Whose place it is: the event's keeps its position when its text changes (D6); a car's loses
 * it at the first keystroke that changes the text (v3). Emptied, both lose it.
 */
export type PlaceRule = "event" | "car";

/** The discreet line under the field: « Recherche de propositions… », « Aucune proposition… », « Propositions indisponibles… ». */
export type PlaceLine = "searching" | "none" | "unavailable";

/** What the field's `status` region says, its words being the view's (`PlaceField.*`). */
export type PlaceAnnouncement =
  | { kind: "count"; count: number }
  | { kind: "none" }
  | { kind: "unavailable" }
  | { kind: "added" }
  | { kind: "removed" };

/** A place as the form holds it: `label` is the chosen suggestion's, never sent; `null` with a position, « Position enregistrée ». */
export interface PlaceValue {
  text: string;
  position: Position | null;
  label: string | null;
}

export interface PlaceFieldState extends PlaceValue {
  rule: PlaceRule;
  /** The suggestions for the current text; `active`, the option an arrow made active. */
  list: { suggestions: Suggestion[]; open: boolean; active: number | null } | null;
  line: PlaceLine | null;
  /** The text whose answer is awaited: an answer for any other is ignored. */
  awaiting: string | null;
  /** The label just chosen: no request for it. */
  chosen: string | null;
  /** The form is sending (AL5.4): no request, no list, « Retirer » does nothing. */
  locked: boolean;
  /** The last thing said, and how many were: a new count is a new announcement, even of the same words. */
  announcement: PlaceAnnouncement | null;
  said: number;
  /** « indisponibles » was said, and no other announcement since, the focus still in the field. */
  unavailableSaid: boolean;
}

/** The field as a form opens it: a saved position has no label. */
export function placeFieldOf({ text, position }: { text: string; position: Position | null }, rule: PlaceRule): PlaceFieldState {
  return {
    text,
    position,
    label: null,
    rule,
    list: null,
    line: null,
    awaiting: null,
    chosen: null,
    locked: false,
    announcement: null,
    said: 0,
    unavailableSaid: false,
  };
}

function say(state: PlaceFieldState, announcement: PlaceAnnouncement): PlaceFieldState {
  return { ...state, announcement, said: state.said + 1, unavailableSaid: announcement.kind === "unavailable" };
}

/**
 * What to ask once the pause is over: the text trimmed, from 3 to 120 characters, the page's
 * language and the event's area rounded to 1 decimal; or nothing, for the label just chosen or
 * while the form is sending.
 */
export function queryOf(state: PlaceFieldState, locale: Locale, near: Position | null): PlaceQuery | null {
  if (state.locked || state.text === state.chosen) return null;
  const query = placeQueryOf({ text: state.text, locale, near });
  return "value" in query ? query.value : null;
}

/** Empty as the domain reads a text (`text()`): nothing but blanks or invisible characters. */
function isEmpty(value: string): boolean {
  const read = readText(value, Number.POSITIVE_INFINITY);
  return "error" in read && read.error === "required";
}

/**
 * A keystroke, or a paste: the list closes, the lines go, an answer awaited is ignored. A car's
 * position goes with any change of the text, the event's when the field is emptied: then
 * « Position retirée. ».
 */
export function typed(state: PlaceFieldState, text: string): PlaceFieldState {
  if (text === state.text) return state;
  const changed: PlaceFieldState = { ...state, text, list: null, line: null, awaiting: null, chosen: null };
  const loses = state.rule === "car" || isEmpty(text);
  if (state.position === null || !loses) return changed;
  return say({ ...changed, position: null, label: null }, { kind: "removed" });
}

/** The request for `text` has left: its answer is awaited if `text` is the current text and the form is not sending. */
export function requested(state: PlaceFieldState, text: string): PlaceFieldState {
  return text === state.text && !state.locked ? { ...state, awaiting: text } : state;
}

/** 1 s without the answer for `text`: « Recherche de propositions… », never said. */
export function waited(state: PlaceFieldState, text: string): PlaceFieldState {
  return text === state.awaiting ? { ...state, line: "searching" } : state;
}

/**
 * The answer for `text`: taken only if it is the one awaited. A keystroke, the focus leaving,
 * a choice and the form sending all stop awaiting it; while it is, there is no list.
 */
export function answered(state: PlaceFieldState, text: string, result: PlaceSearchResult): PlaceFieldState {
  if (text !== state.awaiting) return state;
  const done = { ...state, awaiting: null };
  if (result.state === "unavailable") {
    const shown = { ...done, line: "unavailable" as const };
    return state.unavailableSaid ? shown : say(shown, { kind: "unavailable" });
  }
  const { suggestions } = result;
  if (suggestions.length === 0) return say({ ...done, line: "none" }, { kind: "none" });
  return say({ ...done, list: { suggestions, open: true, active: null }, line: null }, { kind: "count", count: suggestions.length });
}

/** Arrow down (`1`) or up (`-1`): opens the list for the current text, moves its active option, within it. */
export function moved(state: PlaceFieldState, step: 1 | -1): PlaceFieldState {
  if (state.list === null || state.locked) return state;
  const last = state.list.suggestions.length - 1;
  // A closed list has no active option (`closed`).
  const from = state.list.active;
  const active = from === null ? (step === 1 ? 0 : last) : Math.min(Math.max(from + step, 0), last);
  return { ...state, list: { ...state.list, open: true, active } };
}

/** Escape, or Enter without an active option: the list closes, its suggestions kept for the arrows. */
export function closed(state: PlaceFieldState): PlaceFieldState {
  return state.list === null ? state : { ...state, list: { ...state.list, open: false, active: null } };
}

/** The answer awaited no longer is: « Recherche de propositions… », which it would have taken away, goes with it. */
function unawaited(state: PlaceFieldState): PlaceFieldState {
  return { ...state, awaiting: null, line: state.line === "searching" ? null : state.line };
}

/**
 * The focus leaves: the list closes, « Aucune… » or « indisponibles » stays, the answer awaited
 * no longer opens one; « indisponibles » may be said again.
 */
export function left(state: PlaceFieldState): PlaceFieldState {
  return { ...unawaited(closed(state)), unavailableSaid: false };
}

/** An option of the open list chosen: its label in the field, its position, « Position ajoutée. ». The form sending, the list is closed. */
export function chose(state: PlaceFieldState, index: number): PlaceFieldState {
  const suggestion = state.list?.open ? state.list.suggestions[index] : undefined;
  if (suggestion === undefined) return state;
  const { label, lat, lng } = suggestion;
  const choice = { ...state, text: label, position: { lat, lng }, label, list: null, line: null, awaiting: null, chosen: label };
  return say(choice, { kind: "added" });
}

/** « Retirer »: the position goes, the text stays, « Position retirée. »; nothing while the form is sending. */
export function removed(state: PlaceFieldState): PlaceFieldState {
  if (state.position === null || state.locked) return state;
  return say({ ...state, position: null, label: null }, { kind: "removed" });
}

/** The form starts or stops sending: while it does, the list closes and an answer awaited is ignored. */
export function locked(state: PlaceFieldState, sending: boolean): PlaceFieldState {
  return sending ? { ...unawaited(closed(state)), locked: true } : { ...state, locked: false };
}
