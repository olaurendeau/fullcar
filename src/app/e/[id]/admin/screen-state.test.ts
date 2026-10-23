import { describe, expect, it } from "vitest";
import type { OrganiserLeg } from "@/domain/organiser-panel";
import type { EventState } from "../event-state";
import type { AdminLinkCheck } from "./admin-link";
import {
  alertShown,
  announcement,
  editAnswer,
  listKey,
  panelRead,
  screenRead,
  screenReducer,
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
const links = { publicUrl: "https://fullcar.example/e/Ab3dEf7h", adminUrl: "https://fullcar.example/e/Ab3dEf7h/admin#x" };
const valid: AdminLinkCheck = { state: "valid", ...links, legs: before };

const ready = (fields: Partial<Extract<ScreenState, { state: "ready" }>> = {}): ScreenState => ({
  state: "ready",
  panel: { ...links, legs: before },
  refreshing: null,
  refreshFailed: 0,
  refreshed: false,
  expanded: new Set(),
  folded: false,
  ...fields,
});
/** A panel withdrawn after an action whose read failed (O1.10): the links stay. */
const withdrawn = { ...links, legs: null };

describe("screenReducer", () => {
  it.each<[string, ScreenState, ScreenEvent, ScreenState]>([
    // The first read (O5.1, O5.2, O5.3).
    ["loading, the panel", { state: "loading" }, { type: "checked", check: valid }, ready()],
    ["loading, an invalid link", { state: "loading" }, { type: "checked", check: { state: "invalid" } }, { state: "invalid" }],
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
    ["a refresh without the panel", { state: "invalid" }, { type: "refreshStarted", read: 1 }, { state: "invalid" }],
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
    expect(screenReducer({ state: "invalid" }, { type: "toggleFolded" })).toStrictEqual({ state: "invalid" });
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

describe("panelRead", () => {
  it("is the panel's legs when it answered the panel", () => {
    expect(panelRead({ ok: true, value: { state: "panel", legs: after } })).toStrictEqual(after);
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
  const header = { title: "Tournoi de Rennes", location: "Gymnase", allerAt: "2026-12-12 07:30:00", retourAt: null };
  const board: EventState = { event: header, legs: [] };
  const panel = { state: "panel", legs: after };

  it("is the panel's legs and the board's state when both reads answered", () => {
    expect(screenRead({ ok: true, value: panel }, { ok: true, value: board })).toStrictEqual({ legs: after, board });
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
  const event = { title: "Tournoi de Rennes U13", location: "Gymnase", allerAt: "2026-12-12 14:00:00", retourAt: null };

  // M2.1: saved, with the values the server stored.
  it("is saved, with the stored values, on `ok`", () => {
    expect(editAnswer({ ok: true, value: { ok: true, event } })).toStrictEqual({ kind: "saved", event });
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
    ["no answer", undefined],
  ])("is the failure on %s", (_, value) => {
    expect(editAnswer({ ok: true, value })).toStrictEqual({ kind: "problem", problem: "failed" });
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
    ["nothing without the panel", { state: "invalid" }, ""],
  ])("%s", (_, state, shown) => {
    expect(alertShown(state)).toBe(shown);
  });
});
