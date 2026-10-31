import { readFileSync } from "node:fs";
import { createFormatter, createTranslator, type Messages } from "next-intl";
import { describe, expect, it } from "vitest";
import { failureText, wordsOf } from "@/components/event/failure-words";
import type { OrganiserLeg } from "@/domain/organiser-panel";
import en from "../../../../../messages/en.json";
import fr from "../../../../../messages/fr.json";
import type { EventState } from "../event-state";
import type { OrganiserCheck } from "./admin-token-store";
import {
  alertShown,
  announcement,
  editAnswer,
  editFailure,
  listKey,
  PERSONS_LIST,
  panelRead,
  pendingRead,
  pollsPending,
  POLL_MS,
  screenRead,
  screenReducer,
  type EditAnswer,
  type ScreenEvent,
  type ScreenState,
} from "./screen-state";

const leg = (withoutCar: number): OrganiserLeg => ({
  leg: "aller",
  coverage: { withoutCar, freeSeats: 0 },
  carCount: 0,
  withoutCar: [],
  carsWithoutPhone: [],
});
const before = [leg(2)];
const after = [leg(3)];
const links = { publicUrl: "https://fullcar.example/e/Ab3dEf7h" };
const valid: OrganiserCheck = { state: "valid", ...links, legs: before, persons: [] };

const ready = (fields: Partial<Extract<ScreenState, { state: "ready" }>> = {}): ScreenState => ({
  state: "ready",
  panel: { ...links, legs: before },
  persons: [],
  refreshing: null,
  refreshFailed: 0,
  refreshed: false,
  expanded: new Set(),
  folded: false,
  unfolded: new Set(),
  personsOpen: false,
  ...fields,
});
/** A panel withdrawn after an action whose read failed (O1.10): the links stay. */
const withdrawn = { ...links, legs: null };

describe("screenReducer", () => {
  it.each<[string, ScreenState, ScreenEvent, ScreenState]>([
    // The first read (O5.1, O5.2, O5.3).
    ["loading, the panel", { state: "loading" }, { type: "checked", check: valid }, ready()],
    [
      "loading, the area refused, with its screen (#598)",
      { state: "loading" },
      { type: "checked", check: { state: "refused", refusal: { kind: "notYours", email: "a@b.fr" } } },
      { state: "refused", refusal: { kind: "notYours", email: "a@b.fr" } },
    ],
    [
      "loading, a failed check",
      { state: "loading" },
      { type: "checked", check: { state: "failed" } },
      { state: "failed", retrying: false },
    ],
    // « Réessayer » (O5.3): it starts, then ends in the panel or in the failure again.
    [
      "failed, a retry starts",
      { state: "failed", retrying: false },
      { type: "checked", check: { state: "failed", retrying: true } },
      { state: "failed", retrying: true },
    ],
    ["failed, the retry reads the panel", { state: "failed", retrying: true }, { type: "checked", check: valid }, ready()],
    [
      "failed, the retry fails",
      { state: "failed", retrying: true },
      { type: "checked", check: { state: "failed" } },
      { state: "failed", retrying: false },
    ],
    // « Actualiser » (O1.8, O1.9, O5.4).
    ["ready, a refresh starts", ready(), { type: "refreshStarted", read: 1 }, ready({ refreshing: 1 })],
    [
      "ready after a failure, a refresh starts: the alert is emptied, the count kept",
      ready({ refreshFailed: 1 }),
      { type: "refreshStarted", read: 2 },
      ready({ refreshing: 2, refreshFailed: 1 }),
    ],
    [
      "ready after a success, a refresh starts: the announcement goes",
      ready({ refreshed: true }),
      { type: "refreshStarted", read: 2 },
      ready({ refreshing: 2 }),
    ],
    [
      "a success replaces the panel and clears the alert",
      ready({ refreshing: 3, refreshFailed: 2 }),
      { type: "refreshEnded", read: 3, legs: after },
      ready({ panel: { ...links, legs: after }, refreshed: true }),
    ],
    [
      "a failure keeps the panel and counts one more failure",
      ready({ refreshing: 3, refreshFailed: 1 }),
      { type: "refreshEnded", read: 3 },
      ready({ refreshFailed: 2 }),
    ],
    // Only the latest read counts.
    [
      "the end of a read that is no longer the latest",
      ready({ refreshing: 4 }),
      { type: "refreshEnded", read: 3, legs: after },
      ready({ refreshing: 4 }),
    ],
    ["the end of a read after the link was checked again", ready(), { type: "refreshEnded", read: 1, legs: after }, ready()],
    ["a refresh while one runs", ready({ refreshing: 1 }), { type: "refreshStarted", read: 2 }, ready({ refreshing: 1 })],
    ["a refresh without the panel", { state: "refused", refusal: { kind: "pending" } }, { type: "refreshStarted", read: 1 }, { state: "refused", refusal: { kind: "pending" } }],
    // The panel read again after an action of the board (O1.10): no announcement either way.
    [
      "a read after an action replaces the panel, and says nothing",
      ready({ refreshFailed: 1 }),
      { type: "reread", legs: after },
      ready({ panel: { ...links, legs: after } }),
    ],
    [
      "a read after an action that fails withdraws the panel and empties the alert: one message",
      ready({ refreshFailed: 2, refreshed: true }),
      { type: "reread" },
      ready({ panel: withdrawn }),
    ],
    [
      "a read after an action ends a refresh still running, whose board was read before it: the refresh's success",
      ready({ refreshing: 3 }),
      { type: "reread", legs: after },
      ready({ panel: { ...links, legs: after }, refreshed: true }),
    ],
    [
      "a read after an action that fails ends a refresh still running: the refresh's failure, the panel withdrawn",
      ready({ refreshing: 3, refreshFailed: 1 }),
      { type: "reread" },
      ready({ panel: withdrawn, refreshFailed: 2 }),
    ],
    [
      "withdrawn, a failed refresh: the panel stays withdrawn",
      ready({ panel: withdrawn, refreshing: 1 }),
      { type: "refreshEnded", read: 1 },
      ready({ panel: withdrawn, refreshFailed: 1 }),
    ],
    [
      "withdrawn, a successful refresh renders the panel",
      ready({ panel: withdrawn, refreshing: 1, refreshFailed: 1 }),
      { type: "refreshEnded", read: 1, legs: after },
      ready({ panel: { ...links, legs: after }, refreshed: true }),
    ],
    ["a read after an action without the panel", { state: "loading" }, { type: "reread", legs: after }, { state: "loading" }],
    [
      "the link checked again while a refresh runs",
      ready({ refreshing: 1, refreshFailed: 1 }),
      { type: "checked", check: valid },
      ready(),
    ],
  ])("%s", (_, state, event, next) => {
    expect(screenReducer(state, event)).toStrictEqual(next);
  });
});

// O8.4, O8.5, O8.6: the card arrives folded or unfolded, and only its button changes that.
describe("screenReducer, the folded card", () => {
  const folded = ready({ folded: true });

  it.each<[string, ScreenState, ScreenEvent, boolean]>([
    ["the first panel, kept folded", { state: "loading" }, { type: "checked", check: valid, folded: true }, true],
    ["the first panel, kept unfolded", { state: "loading" }, { type: "checked", check: valid, folded: false }, false],
    ["the first panel, nothing read", { state: "loading" }, { type: "checked", check: valid }, false],
    ["« Réessayer » reads the panel, kept folded", { state: "failed", retrying: true }, { type: "checked", check: valid, folded: true }, true],
    ["the button folds", ready(), { type: "toggleFolded" }, true],
    ["the button unfolds", folded, { type: "toggleFolded" }, false],
    ["a refresh starts", folded, { type: "refreshStarted", read: 1 }, true],
    ["a refresh succeeds", ready({ folded: true, refreshing: 1 }), { type: "refreshEnded", read: 1, legs: after }, true],
    ["a refresh fails", ready({ folded: true, refreshing: 1 }), { type: "refreshEnded", read: 1 }, true],
    ["a read after an action succeeds", folded, { type: "reread", legs: after }, true],
    ["a read after an action fails: the panel withdrawn", folded, { type: "reread" }, true],
    ["withdrawn, a refresh fails", ready({ folded: true, panel: withdrawn, refreshing: 1 }), { type: "refreshEnded", read: 1 }, true],
    ["a list unfolded", folded, { type: "listToggled", key: listKey("aller", "withoutCar") }, true],
  ])("%s", (_, state, event, next) => {
    const got = screenReducer(state, event);
    expect(got.state === "ready" && got.folded).toBe(next);
  });

  it("folds and unfolds without touching anything else", () => {
    const state = ready({ refreshing: 2, refreshFailed: 1, expanded: new Set([listKey("aller", "withoutCar")]) });
    expect(screenReducer(state, { type: "toggleFolded" })).toStrictEqual({ ...state, folded: true });
  });

  it("does nothing without the panel", () => {
    const refused = { state: "refused", refusal: { kind: "orphan" } } as const;
    expect(screenReducer(refused, { type: "toggleFolded" })).toStrictEqual(refused);
  });
});

// O5.6, O5.7: which lists are unfolded, by leg and list, in memory alone.
describe("screenReducer, the unfolded lists", () => {
  const person = (n: number) => ({ id: `p${n}`, firstName: `Guest ${n}`, phone: null });
  const car = (n: number) => ({ id: `c${n}`, driverFirstName: `Driver ${n}`, departureTime: "07:15:00", location: "Rennes", taken: 0, free: 3 });
  const lines = (count: number, line: (n: number) => object) => Array.from({ length: count }, (_, n) => line(n)) as never[];
  const crowd = (persons: number, cars: number, of: "aller" | "retour" = "aller"): OrganiserLeg => ({
    leg: of,
    coverage: { withoutCar: persons, freeSeats: 3 * cars },
    carCount: cars,
    withoutCar: lines(persons, person),
    carsWithoutPhone: lines(cars, car),
  });
  const both = new Set([listKey("aller", "withoutCar"), listKey("aller", "carsWithoutPhone")]);
  const at = (legs: OrganiserLeg[], expanded: ReadonlySet<string>) => ready({ panel: { ...links, legs }, expanded });

  it("unfolds a list, then folds it again; nothing else changes", () => {
    const unfolded = screenReducer(ready(), { type: "listToggled", key: listKey("retour", "withoutCar") });
    expect(unfolded).toStrictEqual(ready({ expanded: new Set([listKey("retour", "withoutCar")]) }));
    expect(screenReducer(unfolded, { type: "listToggled", key: listKey("retour", "withoutCar") })).toStrictEqual(ready());
  });

  it.each<[string, ScreenEvent, OrganiserLeg[], ReadonlySet<string>]>([
    ["a refresh, both lists still long", { type: "refreshEnded", read: 1, legs: [crowd(6, 6)] }, [crowd(6, 6)], both],
    ["a read after an action, both still long", { type: "reread", legs: [crowd(7, 9)] }, [crowd(7, 9)], both],
    [
      "a refresh that brings a list to 5 lines: it leaves the set, the other stays",
      { type: "refreshEnded", read: 1, legs: [crowd(5, 6)] },
      [crowd(5, 6)],
      new Set([listKey("aller", "carsWithoutPhone")]),
    ],
    ["a read after an action that empties both", { type: "reread", legs: [crowd(0, 0)] }, [crowd(0, 0)], new Set()],
    ["a leg gone: its lists leave the set", { type: "reread", legs: [crowd(9, 9, "retour")] }, [crowd(9, 9, "retour")], new Set()],
  ])("%s", (_, event, legs, expanded) => {
    const state = at([crowd(8, 8)], both);
    const running = event.type === "refreshEnded" ? { ...state, refreshing: 1 } : state;
    const next = screenReducer(running, event);
    expect(next.state === "ready" && next.expanded).toStrictEqual(expanded);
    expect(next.state === "ready" && next.panel.legs).toStrictEqual(legs);
  });

  it("keeps the set while the panel is withdrawn, and through a failed refresh", () => {
    const gone = screenReducer(at([crowd(8, 8)], both), { type: "reread" });
    expect(gone.state === "ready" && gone.expanded).toStrictEqual(both);
    const failed = screenReducer(screenReducer(gone, { type: "refreshStarted", read: 2 }), { type: "refreshEnded", read: 2 });
    expect(failed.state === "ready" && failed.expanded).toStrictEqual(both);
  });
});

// O9.5: which legs are unfolded, in memory alone: none as the panel appears, then kept but for a leg gone.
describe("screenReducer, the unfolded legs", () => {
  const legOf = (of: "aller" | "retour"): OrganiserLeg => ({ ...leg(1), leg: of });
  const two = [legOf("aller"), legOf("retour")];
  const retour = new Set(["retour" as const]);
  const open = (fields: Partial<Extract<ScreenState, { state: "ready" }>> = {}) =>
    ready({ panel: { ...links, legs: two }, unfolded: retour, ...fields });
  const unfolded = (state: ScreenState) => (state.state === "ready" ? state.unfolded : undefined);
  const through = (state: ScreenState, ...events: ScreenEvent[]) => events.reduce(screenReducer, state);

  it("unfolds a leg, then folds it again; nothing else changes", () => {
    const state = ready({ panel: { ...links, legs: two }, expanded: new Set([listKey("aller", "withoutCar")]), folded: true });
    const once = screenReducer(state, { type: "legToggled", leg: "retour" });
    expect(once).toStrictEqual({ ...state, unfolded: retour });
    expect(screenReducer(once, { type: "legToggled", leg: "retour" })).toStrictEqual(state);
    expect(unfolded(through(state, { type: "legToggled", leg: "aller" }, { type: "legToggled", leg: "retour" }))).toStrictEqual(
      new Set(["aller", "retour"]),
    );
  });

  it.each<[string, ScreenEvent[]]>([
    ["« Actualiser », a success", [{ type: "refreshStarted", read: 1 }, { type: "refreshEnded", read: 1, legs: two }]],
    ["« Actualiser », a failure", [{ type: "refreshStarted", read: 1 }, { type: "refreshEnded", read: 1 }]],
    ["the read after an action of the board", [{ type: "reread", legs: two }]],
    ["the panel withdrawn (O1.10)", [{ type: "reread" }]],
    ["the panel withdrawn, then the read that gives it back", [{ type: "reread" }, { type: "reread", legs: two }]],
    [
      "the panel withdrawn, a refresh that fails, then one that succeeds",
      [{ type: "reread" }, { type: "refreshStarted", read: 2 }, { type: "refreshEnded", read: 2 }, { type: "refreshStarted", read: 3 }, { type: "refreshEnded", read: 3, legs: two }],
    ],
    ["the card folded, then unfolded (O8)", [{ type: "toggleFolded" }, { type: "toggleFolded" }]],
    ["a list unfolded", [{ type: "listToggled", key: listKey("retour", "withoutCar") }]],
  ])("keeps an unfolded leg through %s", (_, events) => {
    expect(unfolded(through(open(), ...events))).toStrictEqual(retour);
  });

  it.each<[string, ScreenState, OrganiserCheck]>([
    ["the first read", { state: "loading" }, valid],
    ["« Réessayer » that succeeds", { state: "failed", retrying: true }, valid],
    ["the link checked again, the panel shown", open(), valid],
  ])("arrives with every leg folded at %s, whatever the card", (_, state, check) => {
    for (const folded of [true, false]) expect(unfolded(screenReducer(state, { type: "checked", check, folded }))).toStrictEqual(new Set());
  });

  it("forgets a retour gone: added back, it comes folded (M3, M4)", () => {
    const gone = through(open(), { type: "reread", legs: [legOf("aller")] });
    expect(unfolded(gone)).toStrictEqual(new Set());
    expect(unfolded(through(gone, { type: "refreshStarted", read: 1 }, { type: "refreshEnded", read: 1, legs: two }))).toStrictEqual(new Set());
    const both = open({ unfolded: new Set(["aller", "retour"]) });
    expect(unfolded(through(both, { type: "reread", legs: [legOf("aller")] }))).toStrictEqual(new Set(["aller"]));
  });

  it("does nothing without the panel", () => {
    expect(screenReducer({ state: "loading" }, { type: "legToggled", leg: "aller" })).toStrictEqual({ state: "loading" });
  });
});

// #672 (remove-person v2, RP4.1): « Personnes inscrites », folded at every appearance, its persons those of the last read.
describe("screenReducer, « Personnes inscrites »", () => {
  const named = (n: number) => ({ id: `p${n}`, firstName: `Guest ${n}`, cells: [] });
  const persons = (count: number) => Array.from({ length: count }, (_, n) => named(n));
  const through = (state: ScreenState, ...events: ScreenEvent[]) => events.reduce(screenReducer, state);
  const of = (state: ScreenState) => (state.state === "ready" ? { open: state.personsOpen, persons: state.persons, expanded: state.expanded } : undefined);

  it("arrives folded with the panel's persons, unfolds and folds by its button alone, and nothing else changes", () => {
    const shown = screenReducer({ state: "loading" }, { type: "checked", check: { ...valid, persons: persons(2) } });
    expect(shown).toStrictEqual(ready({ persons: persons(2) }));
    const open = screenReducer(shown, { type: "personsToggled" });
    expect(open).toStrictEqual(ready({ persons: persons(2), personsOpen: true }));
    expect(screenReducer(open, { type: "personsToggled" })).toStrictEqual(shown);
    expect(of(through(open, { type: "legToggled", leg: "aller" }, { type: "toggleFolded" }))?.open).toBe(true);
  });

  it("stays unfolded through the reads, takes their persons, and keeps them while the panel is withdrawn", () => {
    const open = ready({ persons: persons(3), personsOpen: true });
    expect(of(through(open, { type: "reread", legs: after, persons: persons(2) }))).toStrictEqual({ open: true, persons: persons(2), expanded: new Set() });
    expect(of(through(open, { type: "reread" }))).toMatchObject({ open: true, persons: persons(3) });
    const refreshed = through(open, { type: "refreshStarted", read: 1 }, { type: "refreshEnded", read: 1, legs: after, persons: persons(1) });
    expect(of(refreshed)).toMatchObject({ open: true, persons: persons(1) });
    expect(of(screenReducer(open, { type: "checked", check: valid }))).toMatchObject({ open: false, persons: [] });
  });

  it("keeps its long list unfolded while it has more than 5 lines (O5.6, O5.7)", () => {
    const long = ready({ persons: persons(8), expanded: new Set([PERSONS_LIST]) });
    expect(of(through(long, { type: "reread", legs: after, persons: persons(6) }))?.expanded).toStrictEqual(new Set([PERSONS_LIST]));
    expect(of(through(long, { type: "reread", legs: after, persons: persons(5) }))?.expanded).toStrictEqual(new Set());
  });
});

describe("panelRead", () => {
  it("is the panel's legs and persons when it answered the panel", () => {
    expect(panelRead({ ok: true, value: { state: "panel", legs: after, persons: [] } })).toStrictEqual({ legs: after, persons: [] });
  });

  it.each<[string, unknown]>([
    ["failed", { ok: false, problem: "failed" }],
    ["the link is no longer valid", { ok: true, value: { state: "invalid" } }],
    ["has no legs", { ok: true, value: { state: "panel" } }],
  ])("is nothing when the read %s", (_, sent) => {
    expect(panelRead(sent as never)).toBeUndefined();
  });
});

describe("screenRead", () => {
  const header = { title: "Tournoi de Rennes", location: "Gymnase", locationPosition: null, allerAt: "2026-12-12 07:30:00", retourAt: null, description: null };
  const board: EventState = { event: header, options: { stops: false }, legs: [] };
  const panel = { state: "panel", legs: after, persons: [] };

  it("is the panel's legs and the board's state when both reads answered", () => {
    expect(screenRead({ ok: true, value: panel }, { ok: true, value: board })).toStrictEqual({ legs: after, persons: [], board });
  });

  // O1.9: one failure, and nothing is applied.
  it.each<[string, unknown, unknown]>([
    ["the panel's read failed", { ok: false, problem: "failed" }, { ok: true, value: board }],
    ["the panel's read went offline", { ok: false, problem: "offline" }, { ok: true, value: board }],
    ["the board's read failed", { ok: true, value: panel }, { ok: false, problem: "failed" }],
    ["the link is no longer valid", { ok: true, value: { state: "invalid" } }, { ok: true, value: board }],
    ["the panel's answer is undefined", { ok: true, value: undefined }, { ok: true, value: board }],
    ["the panel's answer has no legs", { ok: true, value: { state: "panel" } }, { ok: true, value: board }],
    ["the board's state is undefined", { ok: true, value: panel }, { ok: true, value: undefined }],
    ["the board's state has no header (epic #250)", { ok: true, value: panel }, { ok: true, value: [] }],
  ])("is nothing when %s", (_, panelSent, boardSent) => {
    expect(screenRead(panelSent as never, boardSent as never)).toBeUndefined();
  });
});

describe("editAnswer", () => {
  const event = { title: "Tournoi de Rennes U13", location: "Gymnase", locationPosition: null, allerAt: "2026-12-12 14:00:00", retourAt: null };

  // M2.1: saved, with the values the server stored.
  it("is saved, with the stored values, on `ok`", () => {
    expect(editAnswer({ ok: true, value: { ok: true, event } })).toStrictEqual({ kind: "saved", event });
  });

  // AL5.6: the position kept is in the values stored.
  it("is saved or changed, with the position stored", () => {
    const placed = { ...event, locationPosition: { lat: 48.1173, lng: -1.67779 } };
    expect(editAnswer({ ok: true, value: { ok: true, event: placed } })).toStrictEqual({ kind: "saved", event: placed });
    expect(editAnswer({ ok: true, value: { ok: false, error: "changed", event: placed } })).toStrictEqual({
      kind: "changed",
      event: placed,
    });
  });

  // DS1.10, DS2.8: the description the server stored, a text or none, shows at once on /admin.
  it.each<[string, Record<string, unknown>]>([
    ["a description", { ...event, description: "Rendez-vous à 7 h" }],
    ["no description", { ...event, description: null }],
    ["a header without a description, from a server before it", event],
  ])("is saved or changed, with %s", (_, stored) => {
    expect(editAnswer({ ok: true, value: { ok: true, event: stored } })).toStrictEqual({ kind: "saved", event: stored });
    expect(editAnswer({ ok: true, value: { ok: false, error: "changed", event: stored } })).toStrictEqual({ kind: "changed", event: stored });
  });

  // M2.3: the server's errors show by their field.
  it("is the errors on a field refused", () => {
    expect(editAnswer({ ok: true, value: { ok: false, errors: { title: "required" } } })).toStrictEqual({
      kind: "errors",
      errors: { title: "required" },
    });
  });

  // M8.1: offline, or the server failed.
  it.each(["offline", "failed"] as const)("is the problem %s when the request failed", (problem) => {
    expect(editAnswer({ ok: false, problem })).toStrictEqual({ kind: "problem", problem });
  });

  // M6.1, M6.2: changed on another device, with what is stored.
  it("is changed, with the stored values, on `changed`", () => {
    expect(editAnswer({ ok: true, value: { ok: false, error: "changed", event } })).toStrictEqual({ kind: "changed", event });
  });

  // M8.2, M8.3: the link refused, or the event gone.
  it.each(["invalid", "eventNotFound"] as const)("is the refusal %s", (reason) => {
    expect(editAnswer({ ok: true, value: { ok: false, error: reason } })).toStrictEqual({ kind: "refused", reason });
  });

  // M3.2, M3.5: the retour unchecked still holds these, to confirm.
  it("is the numbers to confirm on `confirmRetour`", () => {
    expect(editAnswer({ ok: true, value: { ok: false, error: "confirmRetour", cars: 2, persons: 9 } })).toStrictEqual({
      kind: "confirmRetour",
      counts: { cars: 2, persons: 9 },
    });
  });

  // D1: the option stored comes with the answer, from a server that says it.
  it("carries the option stored on `ok` and on `changed`, when the server says it", () => {
    expect(editAnswer({ ok: true, value: { ok: true, event, stops: true } })).toStrictEqual({ kind: "saved", event, stops: true });
    expect(editAnswer({ ok: true, value: { ok: false, error: "changed", event, stops: false } })).toStrictEqual({
      kind: "changed",
      event,
      stops: false,
    });
  });

  it("ignores an option that is no boolean", () => {
    expect(editAnswer({ ok: true, value: { ok: true, event, stops: "yes" } })).toStrictEqual({ kind: "saved", event });
  });

  // RV9.3: the option stays on, and the number of cars that hold it.
  it("is the number of cars on `stopsLocked`", () => {
    expect(editAnswer({ ok: true, value: { ok: false, error: "stopsLocked", cars: 2 } })).toStrictEqual({ kind: "stopsLocked", cars: 2 });
  });

  it.each<[string, unknown]>([
    ["without its number", { ok: false, error: "stopsLocked" }],
    ["with a number that is no count", { ok: false, error: "stopsLocked", cars: -1 }],
  ])("is the failure on `stopsLocked` %s", (_, value) => {
    expect(editAnswer({ ok: true, value })).toStrictEqual({ kind: "problem", problem: "failed" });
  });

  // Nothing was written, and the sheet says the generic failure.
  it.each<[string, unknown]>([
    ["`changed` without a header", { ok: false, error: "changed" }],
    ["`changed` with a header missing its place", { ok: false, error: "changed", event: { ...event, location: 1 } }],
    ["`confirmRetour` without its numbers", { ok: false, error: "confirmRetour" }],
    ["`confirmRetour` with a number that is not a count", { ok: false, error: "confirmRetour", cars: 1.5, persons: 2 }],
    ["`confirmRetour` with a negative number", { ok: false, error: "confirmRetour", cars: 1, persons: -1 }],
    ["another error", { ok: false, error: "rideGone" }],
    ["`ok` without a header", { ok: true }],
    ["`ok` with a header missing its title", { ok: true, event: { ...event, title: undefined } }],
    ["`ok` with a header missing its position", { ok: true, event: { ...event, locationPosition: undefined } }],
    ["`changed` with a position that is not one", { ok: false, error: "changed", event: { ...event, locationPosition: { lat: "48.1" } } }],
    ["`ok` with a description that is not text", { ok: true, event: { ...event, description: 42 } }],
    ["`changed` with a description in an array", { ok: false, error: "changed", event: { ...event, description: ["Rendez-vous"] } }],
    ["no answer", undefined],
  ])("is the failure on %s", (_, value) => {
    expect(editAnswer({ ok: true, value })).toStrictEqual({ kind: "problem", problem: "failed" });
  });
});

// M2.8, M2.9, C11.11 amended: the sheet closed before the answer, the bar says what was not done,
// then why, word for word as the table « Chaque échec de la v3.3, mot pour mot » has it.
// M3.7 (#273): a removal confirmed, its confirmation closed after 10 s, then the sheet: the same,
// with what the removal did not do, and the numbers of a retour changed meanwhile.
describe("editFailure: the sheet closed before the answer, word for word", () => {
  const event = { title: "Tournoi de Rennes U13", location: "Gymnase", locationPosition: null, allerAt: "2026-12-12 14:00:00", retourAt: null, description: null };
  const words = (locale: "fr" | "en") =>
    wordsOf(createTranslator<Messages>({ locale, messages: locale === "fr" ? fr : en }), createFormatter({ locale }));
  /** The answers of a row's failure column. */
  const ANSWERS: Record<string, EditAnswer[]> = {
    "hors ligne": [{ kind: "problem", problem: "offline" }],
    "erreur serveur (500, réseau), `invalid`": [
      { kind: "problem", problem: "failed" },
      { kind: "refused", reason: "invalid" },
    ],
    "`eventNotFound`": [{ kind: "refused", reason: "eventNotFound" }],
    "`errors`": [{ kind: "errors", errors: { allerDate: "tooEarly" } }],
    "`changed`": [{ kind: "changed", event }],
    "`confirmRetour`": [{ kind: "confirmRetour", counts: { cars: 2, persons: 9 } }],
    "`confirmRetour` (nombres changés : 3 voitures, 10 personnes)": [{ kind: "confirmRetour", counts: { cars: 3, persons: 10 } }],
  };
  const readme = readFileSync(new URL("../../../../../docs/design/organizer-view/README.md", import.meta.url), "utf8").split("\n");
  const rows = (action: string) =>
    readme
      .filter((line) => line.startsWith(`|  ${action} |`))
      .map((line) => line.split("|").map((cell) => cell.trim()))
      .map(([, , failure, fr, en]) => ({ failure, fr, en }));

  const FAILURES = ["hors ligne", "erreur serveur (500, réseau), `invalid`", "`eventNotFound`", "`errors`", "`changed`"];
  for (const [action, removal, last] of [
    ["« Modifier l’événement », feuille fermée pendant l’envoi", false, "`confirmRetour`"],
    ["« Supprimer le retour », confirmation fermée après 10 s, puis feuille fermée", true, "`confirmRetour` (nombres changés : 3 voitures, 10 personnes)"],
  ] as const) {
    const table = rows(action);

    it(`${action}: reads its six rows, one per failure, in the table's order`, () => {
      expect(table.map((row) => row.failure)).toEqual([...FAILURES, last]);
    });

    for (const { failure, fr: inFrench, en: inEnglish } of table) {
      for (const answer of ANSWERS[failure] ?? []) {
        it(`${action}, ${failure}: ${answer.kind}`, () => {
          const { notDone, why } = editFailure(answer as Exclude<EditAnswer, { kind: "saved" }>, removal);
          expect(failureText(words("fr"), notDone, why)).toBe(inFrench);
          expect(failureText(words("en"), notDone, why)).toBe(inEnglish);
        });
      }
    }
  }
});

// RV9.4, RV9.3 (docs/design/meeting-points, section 1 bis): the sheet closed before the answer of a
// change that only touched the option « Points de RDV ».
describe("editFailure: the option « Points de RDV », word for word", () => {
  const words = (locale: "fr" | "en") =>
    wordsOf(createTranslator<Messages>({ locale, messages: locale === "fr" ? fr : en }), createFormatter({ locale }));
  const said = (answer: Exclude<EditAnswer, { kind: "saved" }>, optionOnly: boolean, locale: "fr" | "en" = "fr") => {
    const { notDone, why } = editFailure(answer, false, optionOnly);
    return failureText(words(locale), notDone, why);
  };

  it.each<[string, Exclude<EditAnswer, { kind: "saved" }>, string, string]>([
    [
      "offline",
      { kind: "problem", problem: "offline" },
      "L’option « Points de RDV » n’a pas été modifiée. Vérifiez la connexion, puis réessayez.",
      "The “Meeting points” option was not changed. Check your connection, then try again.",
    ],
    [
      "a server error",
      { kind: "problem", problem: "failed" },
      "L’option « Points de RDV » n’a pas été modifiée. Une erreur est survenue : réessayez dans un instant.",
      "The “Meeting points” option was not changed. Something went wrong: try again in a moment.",
    ],
    [
      "cars that have meeting points (RV9.3)",
      { kind: "stopsLocked", cars: 2 },
      "L’option « Points de RDV » reste active : des voitures ont des points de RDV.",
      "The “Meeting points” option stays on: cars have meeting points.",
    ],
  ])("%s: the option alone", (_, answer, inFrench, inEnglish) => {
    expect(said(answer, true)).toBe(inFrench);
    expect(said(answer, true, "en")).toBe(inEnglish);
  });

  it("another field changed too: the event was not changed, and the option stays on as the reason says", () => {
    expect(said({ kind: "stopsLocked", cars: 1 }, false)).toBe(
      "L’événement n’a pas été modifié. L’option « Points de RDV » reste active : des voitures ont des points de RDV.",
    );
    expect(said({ kind: "problem", problem: "offline" }, false)).toBe("L’événement n’a pas été modifié. Vérifiez la connexion, puis réessayez.");
  });

  it("a removal of the retour keeps its own words", () => {
    const { notDone } = editFailure({ kind: "stopsLocked", cars: 1 }, true, true);
    expect(notDone).toEqual({ kind: "removeRetour" });
  });
});

describe("announcement", () => {
  it.each<[string, ScreenState, ReturnType<typeof announcement>]>([
    ["nothing before a refresh", ready(), ""],
    ["« Actualisation… » while one runs, even after a failure", ready({ refreshing: 1, refreshFailed: 1 }), "refreshing"],
    ["the success", ready({ refreshed: true }), "refreshed"],
    ["the failure", ready({ refreshFailed: 1 }), "failed"],
    ["the failure once the panel is withdrawn: its other body", ready({ panel: withdrawn, refreshFailed: 1 }), "failedWithdrawn"],
    ["nothing once the panel is withdrawn: the sentence is not live", ready({ panel: withdrawn }), ""],
    ["nothing without the panel", { state: "failed", retrying: true }, ""],
  ])("%s", (_, state, said) => {
    expect(announcement(state)).toBe(said);
  });
});

// O5.4, and the review of #211: the alert stays on screen while the next read runs, out of its region.
describe("alertShown", () => {
  it.each<[string, ScreenState, ReturnType<typeof alertShown>]>([
    ["nothing before a failure", ready(), ""],
    ["the body after a failure", ready({ refreshFailed: 1 }), "body"],
    ["the body still while the next read runs", ready({ refreshFailed: 1, refreshing: 2 }), "body"],
    ["the withdrawn body, the panel withdrawn", ready({ panel: withdrawn, refreshFailed: 1, refreshing: 2 }), "bodyWithdrawn"],
    ["nothing withdrawn without a failure: the sentence instead", ready({ panel: withdrawn }), ""],
    ["nothing without the panel", { state: "refused", refusal: { kind: "signIn" } }, ""],
  ])("%s", (_, state, shown) => {
    expect(alertShown(state)).toBe(shown);
  });
});

describe("the notice « Confirmez votre adresse » (OA1.7)", () => {
  const sending = { email: "claire.martin@exemple.fr", send: "sending" } as const;
  const sent = { ...sending, send: "sent" } as const;

  it("comes with the panel, and is in the panel only when the server sent one", () => {
    expect(screenReducer({ state: "loading" }, { type: "checked", check: { ...valid, pending: sending } })).toStrictEqual(
      ready({ panel: { ...links, legs: before, pending: sending } }),
    );
    expect(screenReducer({ state: "loading" }, { type: "checked", check: valid })).toStrictEqual(ready());
  });

  it("a read while sending replaces it, and only it; without one, the notice goes (OA2.6)", () => {
    const registered = [
      { id: "p0", firstName: "Guest 0", cells: [] },
      { id: "p1", firstName: "Guest 1", cells: [] },
    ];
    const shown = ready({
      panel: { ...links, legs: before, pending: sending },
      persons: registered,
      personsOpen: true,
      expanded: new Set(["aller:withoutCar"]),
    });
    const replaced = screenReducer(shown, { type: "pendingRead", pending: sent });
    expect(replaced).toStrictEqual({ ...shown, panel: { ...links, legs: before, pending: sent } });
    // The persons of « Personnes inscrites » are not the notice's business: kept, and still unfolded.
    expect(replaced).toMatchObject({ persons: registered, personsOpen: true });
    expect(screenReducer(shown, { type: "pendingRead" })).toStrictEqual({ ...shown, panel: { ...links, legs: before } });
    // Withdrawn, the sections stay withdrawn.
    const away = ready({ panel: { ...withdrawn, pending: sending } });
    expect(screenReducer(away, { type: "pendingRead", pending: sent })).toStrictEqual(ready({ panel: { ...withdrawn, pending: sent } }));
  });

  it("given up while sending, reads as a failure, as the server reads a send left « sending » after 30 s", () => {
    const shown = ready({ panel: { ...links, legs: before, pending: sending } });
    expect(screenReducer(shown, { type: "pendingGaveUp" })).toStrictEqual(
      ready({ panel: { ...links, legs: before, pending: { ...sending, send: "failed" } } }),
    );
    // A result kept meanwhile, or no notice, stays as it is.
    const kept = ready({ panel: { ...links, legs: before, pending: sent } });
    expect(screenReducer(kept, { type: "pendingGaveUp" })).toBe(kept);
    const none = ready();
    expect(screenReducer(none, { type: "pendingGaveUp" })).toBe(none);
  });

  it("does nothing without the panel", () => {
    const refused: ScreenState = { state: "refused", refusal: { kind: "pending" } };
    for (const state of [{ state: "loading" }, refused, { state: "failed", retrying: false }] as ScreenState[]) {
      expect(screenReducer(state, { type: "pendingRead", pending: sent })).toBe(state);
    }
  });

  it("is read again, every POLL_MS, only while the email is on its way", () => {
    expect(POLL_MS).toBe(2_000);
    expect(pollsPending(ready({ panel: { ...links, legs: before, pending: sending } }))).toBe(true);
    for (const send of ["sent", "failed", "addressLimit"] as const) {
      expect(pollsPending(ready({ panel: { ...links, legs: before, pending: { ...sending, send } } }))).toBe(false);
    }
    expect(pollsPending(ready())).toBe(false);
    expect(pollsPending({ state: "loading" })).toBe(false);
  });

  it("pendingRead: the notice of a panel read, none on a panel without one, and nothing to apply otherwise", () => {
    expect(pendingRead({ ok: true, value: { state: "panel", legs: after, pending: sent } })).toStrictEqual({ pending: sent });
    expect(pendingRead({ ok: true, value: { state: "panel", legs: after } })).toStrictEqual({});
    expect(pendingRead({ ok: true, value: { state: "panel", legs: after, pending: { email: 1 } } })).toStrictEqual({});
    expect(pendingRead({ ok: false, problem: "offline" })).toBeUndefined();
    expect(pendingRead({ ok: true, value: { state: "pending" } })).toBeUndefined();
    expect(pendingRead({ ok: true, value: undefined })).toBeUndefined();
  });
});
