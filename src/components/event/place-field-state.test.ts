import { describe, expect, it } from "vitest";
import type { Suggestion } from "@/domain/suggestion";
import {
  answered,
  chose,
  closed,
  left,
  locked,
  moved,
  placeFieldOf,
  queryOf,
  removed,
  requested,
  typed,
  waited,
  type PlaceFieldState,
} from "./place-field-state";

const LILAS = { lat: 45.75813, lng: 4.68944 };
const SALLES: Suggestion[] = [
  { label: "Salle des fêtes, 69670 Vaugneray", lat: 45.73791, lng: 4.65616 },
  { label: "Salle des fêtes, 69126 Brindas", lat: 45.71989, lng: 4.69613 },
  { label: "Salle des fêtes, 69290 Craponne", lat: 45.74571, lng: 4.72282 },
];

/** A field of `rule` where « Salle des f » was typed, asked, and answered with SALLES. */
function withList(rule: "event" | "car" = "event"): PlaceFieldState {
  const typing = typed(placeFieldOf({ text: "", position: null }, rule), "Salle des f");
  return answered(requested(typing, "Salle des f"), "Salle des f", { state: "ok", suggestions: SALLES });
}

/** A field of `rule` after the second suggestion was chosen. */
function withChoice(rule: "event" | "car" = "event"): PlaceFieldState {
  return chose(withList(rule), 1);
}

/** What the field says, in the order it says it: a new `said` is a new announcement. */
function said(...states: PlaceFieldState[]) {
  return states.flatMap((state, n) => (n > 0 && state.said === states[n - 1].said ? [] : [state.announcement]));
}

describe("placeFieldOf", () => {
  it("opens with its text and position, a saved position, no list, no line, nothing said", () => {
    expect(placeFieldOf({ text: "Brindas", position: LILAS }, "car")).toMatchObject({
      text: "Brindas",
      position: LILAS,
      label: null,
      list: null,
      line: null,
      announcement: null,
    });
  });
});

describe("queryOf: when a request leaves", () => {
  const locale = "fr";

  it("asks for the text trimmed, with the page's language and the event's area rounded to 1 decimal", () => {
    const state = typed(placeFieldOf({ text: "", position: null }, "car"), "  Brindas ");
    expect(queryOf(state, locale, { lat: 45.7581, lng: 4.6894 })).toEqual({
      text: "Brindas",
      locale: "fr",
      near: { lat: 45.8, lng: 4.7 },
    });
    expect(queryOf(state, "en", null)).toEqual({ text: "Brindas", locale: "en", near: null });
  });

  it("asks nothing under 3 characters after trim, nor over 120", () => {
    const field = placeFieldOf({ text: "", position: null }, "event");
    expect(queryOf(typed(field, "  Br  "), locale, null)).toBeNull();
    expect(queryOf(typed(field, "Bri"), locale, null)).toEqual({ text: "Bri", locale, near: null });
    expect(queryOf(typed(field, "a".repeat(120)), locale, null)).not.toBeNull();
    expect(queryOf(typed(field, "a".repeat(121)), locale, null)).toBeNull();
  });

  it("asks nothing for the label just chosen, and asks again once the text changes", () => {
    const choice = withChoice();
    expect(queryOf(choice, locale, null)).toBeNull();
    expect(queryOf(typed(choice, "Salle des fêtes, 69126 Brinda"), locale, null)).not.toBeNull();
  });

  it("asks for the label typed back after a change: it is no longer the one just chosen", () => {
    const choice = withChoice();
    const back = typed(typed(choice, `${choice.text}x`), choice.text);
    expect(queryOf(back, locale, null)).toEqual({ text: choice.text, locale, near: null });
  });

  it("asks nothing while the form is sending", () => {
    const state = locked(typed(placeFieldOf({ text: "", position: null }, "event"), "Brindas"), true);
    expect(queryOf(state, locale, null)).toBeNull();
    expect(queryOf(locked(state, false), locale, null)).not.toBeNull();
  });
});

describe("a keystroke", () => {
  it("closes the list and takes the lines away", () => {
    const list = withList();
    expect(list.list?.open).toBe(true);
    expect(typed(list, "Salle des fe").list).toBeNull();
    const none = answered(requested(typed(list, "Nulle part"), "Nulle part"), "Nulle part", { state: "ok", suggestions: [] });
    expect(none.line).toBe("none");
    expect(typed(none, "Nulle part ici").line).toBeNull();
  });

  it("makes an answer still awaited for the text before it ignored", () => {
    const asked = requested(typed(placeFieldOf({ text: "", position: null }, "event"), "Salle des f"), "Salle des f");
    const later = typed(asked, "Salle des fê");
    expect(answered(later, "Salle des f", { state: "ok", suggestions: SALLES })).toEqual(later);
  });

  it("changes nothing when the text is the same", () => {
    const choice = withChoice("car");
    expect(typed(choice, choice.text)).toEqual(choice);
  });
});

describe("the position, rule event", () => {
  it("stays through a keystroke, its label with it", () => {
    const after = typed(withChoice("event"), "Salle des fêtes de Brindas");
    expect(after).toMatchObject({ position: { lat: 45.71989, lng: 4.69613 }, label: SALLES[1].label });
  });

  it("leaves when the field is emptied, and says « Position retirée. »", () => {
    const choice = withChoice("event");
    const emptied = typed(choice, "");
    expect(emptied).toMatchObject({ position: null, label: null });
    expect(said(choice, emptied)).toEqual([{ kind: "added" }, { kind: "removed" }]);
  });

  it("leaves when only blanks are left", () => {
    expect(typed(withChoice("event"), "   ").position).toBeNull();
  });

  it("leaves when only invisible characters are left, as the domain reads an empty text", () => {
    expect(typed(withChoice("event"), "​⁠").position).toBeNull();
    expect(typed(withChoice("event"), "​Brindas").position).toEqual({ lat: 45.71989, lng: 4.69613 });
    // The domain refuses a NUL character as invalid, not as empty: the form will say so, the position stays.
    expect(typed(withChoice("event"), "\u0000").position).toEqual({ lat: 45.71989, lng: 4.69613 });
  });
});

describe("the position, rule car", () => {
  it("leaves at the first keystroke that changes the text, and says « Position retirée. » once", () => {
    const choice = withChoice("car");
    const first = typed(choice, "Salle des fêtes, 69126 Brinda");
    const second = typed(first, "Salle des fêtes, 69126 Brind");
    expect(first).toMatchObject({ position: null, label: null });
    expect(said(choice, first, second)).toEqual([{ kind: "added" }, { kind: "removed" }]);
  });

  it("leaves for a pasted text as for a keystroke", () => {
    expect(typed(withChoice("car"), "Brindas").position).toBeNull();
  });

  it("leaves a saved position at the first keystroke", () => {
    const opened = placeFieldOf({ text: "12 rue des Lilas, 69126 Brindas", position: LILAS }, "car");
    const blurred = typed(opened, "Brindas");
    expect(blurred.position).toBeNull();
    expect(blurred.announcement).toEqual({ kind: "removed" });
  });

  it("says nothing when a field without a position is emptied", () => {
    const field = typed(placeFieldOf({ text: "", position: null }, "car"), "Brindas");
    expect(said(field, typed(field, ""))).toEqual([null]);
  });

  it("comes back with the next choice", () => {
    const blurred = typed(withChoice("car"), "Salle des f");
    const again = answered(requested(blurred, "Salle des f"), "Salle des f", { state: "ok", suggestions: SALLES });
    expect(chose(again, 2).position).toEqual({ lat: 45.74571, lng: 4.72282 });
  });
});

describe("an answer", () => {
  it("opens the list for the current text, no option active, and says how many", () => {
    const list = withList();
    expect(list.list).toEqual({ suggestions: SALLES, open: true, active: null });
    expect(list.line).toBeNull();
    expect(list.announcement).toEqual({ kind: "count", count: 3 });
  });

  it("without a suggestion: the line « Aucune proposition… », said, and no list", () => {
    const none = answered(requested(typed(placeFieldOf({ text: "", position: null }, "event"), "Nulle part"), "Nulle part"), "Nulle part", {
      state: "ok",
      suggestions: [],
    });
    expect(none).toMatchObject({ list: null, line: "none", announcement: { kind: "none" } });
  });

  it("unavailable: the line « Propositions indisponibles… », said", () => {
    const off = answered(requested(typed(placeFieldOf({ text: "", position: null }, "event"), "Brindas"), "Brindas"), "Brindas", {
      state: "unavailable",
    });
    expect(off).toMatchObject({ list: null, line: "unavailable", announcement: { kind: "unavailable" } });
  });

  it("not asked for, or for another text, is ignored", () => {
    const field = typed(placeFieldOf({ text: "", position: null }, "event"), "Brindas");
    expect(answered(field, "Brindas", { state: "ok", suggestions: SALLES })).toEqual(field);
    const asked = requested(field, "Brindas");
    expect(answered(asked, "Brin", { state: "ok", suggestions: SALLES })).toEqual(asked);
  });

  it("is taken once: a second answer for the same request is ignored", () => {
    const list = withList();
    expect(answered(list, "Salle des f", { state: "unavailable" })).toEqual(list);
  });

  it("arriving while the form is sending is ignored, and still once it has sent", () => {
    const asked = requested(typed(placeFieldOf({ text: "", position: null }, "event"), "Brindas"), "Brindas");
    const sending = locked(asked, true);
    expect(answered(sending, "Brindas", { state: "ok", suggestions: SALLES })).toEqual(sending);
    const sent = locked(sending, false);
    expect(answered(sent, "Brindas", { state: "ok", suggestions: SALLES })).toEqual(sent);
  });

  it("for a request that left for an older text is ignored", () => {
    const field = typed(placeFieldOf({ text: "", position: null }, "event"), "Brindas");
    const stale = requested(field, "Brin");
    expect(answered(stale, "Brin", { state: "ok", suggestions: SALLES })).toEqual(stale);
  });

  it("for a request that left while the form was sending is ignored, even once it has sent", () => {
    const sending = locked(typed(placeFieldOf({ text: "", position: null }, "event"), "Brindas"), true);
    const sent = locked(requested(sending, "Brindas"), false);
    expect(answered(sent, "Brindas", { state: "ok", suggestions: SALLES })).toEqual(sent);
  });
});

describe("« Propositions indisponibles… », said once while the focus stays", () => {
  const off = { state: "unavailable" } as const;
  const pause = (state: PlaceFieldState, text: string) => answered(requested(typed(state, text), text), text, off);

  it("puts the line back at the next pause without saying it again", () => {
    const first = pause(placeFieldOf({ text: "", position: null }, "event"), "Brindas");
    const second = pause(first, "Brindas ");
    expect(second.line).toBe("unavailable");
    expect(said(first, second)).toEqual([{ kind: "unavailable" }]);
  });

  it("says it again after another announcement", () => {
    const first = pause(placeFieldOf({ text: "", position: null }, "event"), "Brindas");
    const list = answered(requested(typed(first, "Salle des f"), "Salle des f"), "Salle des f", { state: "ok", suggestions: SALLES });
    const again = pause(list, "Salle des fê");
    expect(said(first, list, again)).toEqual([{ kind: "unavailable" }, { kind: "count", count: 3 }, { kind: "unavailable" }]);
  });

  it("says it again once the focus has left the field", () => {
    const first = pause(placeFieldOf({ text: "", position: null }, "event"), "Brindas");
    const back = left(first);
    const again = pause(back, "Brindas ");
    expect(said(first, back, again)).toEqual([{ kind: "unavailable" }, { kind: "unavailable" }]);
  });
});

describe("« Recherche de propositions… »", () => {
  it("shows after 1 s for the request still awaited, and leaves with its answer", () => {
    const asked = requested(typed(placeFieldOf({ text: "", position: null }, "event"), "Brindas"), "Brindas");
    const waiting = waited(asked, "Brindas");
    expect(waiting.line).toBe("searching");
    expect(answered(waiting, "Brindas", { state: "ok", suggestions: SALLES }).line).toBeNull();
  });

  it("is never said", () => {
    const asked = requested(typed(placeFieldOf({ text: "", position: null }, "event"), "Brindas"), "Brindas");
    expect(said(asked, waited(asked, "Brindas"))).toEqual([null]);
  });

  it("does not show for a text that has changed, nor once answered", () => {
    const asked = requested(typed(placeFieldOf({ text: "", position: null }, "event"), "Brindas"), "Brindas");
    expect(waited(typed(asked, "Brindas "), "Brindas").line).toBeNull();
    expect(waited(withList(), "Salle des f").line).toBeNull();
  });

  it("leaves with the focus, whose answer is no longer awaited, and the other lines stay", () => {
    const waiting = waited(requested(typed(placeFieldOf({ text: "", position: null }, "event"), "Brindas"), "Brindas"), "Brindas");
    expect(left(waiting).line).toBeNull();
    const none = answered(requested(typed(placeFieldOf({ text: "", position: null }, "event"), "Nulle part"), "Nulle part"), "Nulle part", {
      state: "ok",
      suggestions: [],
    });
    expect(left(none).line).toBe("none");
  });

  it("leaves when the form starts sending, and does not come back once it has sent", () => {
    const waiting = waited(requested(typed(placeFieldOf({ text: "", position: null }, "event"), "Brindas"), "Brindas"), "Brindas");
    const sending = locked(waiting, true);
    expect(sending.line).toBeNull();
    expect(locked(sending, false).line).toBeNull();
    const off = answered(requested(typed(placeFieldOf({ text: "", position: null }, "event"), "Brindas"), "Brindas"), "Brindas", {
      state: "unavailable",
    });
    expect(locked(off, true).line).toBe("unavailable");
  });

  it("leaves at the next keystroke", () => {
    const waiting = waited(requested(typed(placeFieldOf({ text: "", position: null }, "event"), "Brindas"), "Brindas"), "Brindas");
    expect(typed(waiting, "Brindas ").line).toBeNull();
  });
});

describe("the list", () => {
  it("moves its active option down and up, from none, staying within the list", () => {
    const list = withList();
    const down = moved(list, 1);
    expect(down.list?.active).toBe(0);
    expect(moved(moved(moved(down, 1), 1), 1).list?.active).toBe(2);
    expect(moved(down, -1).list?.active).toBe(0);
    expect(moved(list, -1).list?.active).toBe(2);
  });

  it("closes and reopens for the same text, with no option active", () => {
    const shut = closed(moved(withList(), 1));
    expect(shut.list).toEqual({ suggestions: SALLES, open: false, active: null });
    expect(moved(shut, 1).list).toEqual({ suggestions: SALLES, open: true, active: 0 });
  });

  it("closes when the focus leaves, the line staying", () => {
    expect(left(withList()).list?.open).toBe(false);
    const none = answered(requested(typed(placeFieldOf({ text: "", position: null }, "event"), "Nulle part"), "Nulle part"), "Nulle part", {
      state: "ok",
      suggestions: [],
    });
    expect(left(none).line).toBe("none");
  });

  it("does not open for an answer that arrives once the focus has left", () => {
    const asked = requested(typed(placeFieldOf({ text: "", position: null }, "event"), "Salle des f"), "Salle des f");
    const away = left(asked);
    expect(answered(away, "Salle des f", { state: "ok", suggestions: SALLES })).toEqual(away);
  });

  it("does not move without suggestions", () => {
    const field = typed(placeFieldOf({ text: "", position: null }, "event"), "Brindas");
    expect(moved(field, 1)).toEqual(field);
  });

  it("closes when the form starts sending, and the arrows do not open it then", () => {
    const sending = locked(moved(withList(), 1), true);
    expect(sending.list).toEqual({ suggestions: SALLES, open: false, active: null });
    expect(moved(sending, 1)).toEqual(sending);
  });
});

describe("a choice", () => {
  it("puts its label in the field with its position, closes the list, and says « Position ajoutée. »", () => {
    const choice = withChoice();
    expect(choice).toMatchObject({
      text: "Salle des fêtes, 69126 Brindas",
      position: { lat: 45.71989, lng: 4.69613 },
      label: "Salle des fêtes, 69126 Brindas",
      list: null,
      line: null,
      announcement: { kind: "added" },
    });
  });

  it("of an option that is not there changes nothing", () => {
    const list = withList();
    expect(chose(list, 3)).toEqual(list);
    expect(chose(closed(list), 0)).toEqual(closed(list));
  });

  it("changes nothing while the form is sending", () => {
    const sending = locked(withList(), true);
    expect(chose(sending, 0)).toEqual(sending);
  });
});

describe("« Retirer »", () => {
  it("takes the position and its label away, keeps the text, and says « Position retirée. »", () => {
    const choice = withChoice();
    const gone = removed(choice);
    expect(gone).toMatchObject({ text: choice.text, position: null, label: null });
    expect(said(choice, gone)).toEqual([{ kind: "added" }, { kind: "removed" }]);
  });

  it("does nothing while the form is sending", () => {
    const sending = locked(withChoice(), true);
    expect(removed(sending)).toEqual(sending);
  });

  it("does nothing without a position", () => {
    const field = typed(placeFieldOf({ text: "", position: null }, "event"), "Brindas");
    expect(removed(field)).toEqual(field);
  });
});
