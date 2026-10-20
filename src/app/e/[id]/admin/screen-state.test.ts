import { describe, expect, it } from "vitest";
import type { OrganiserLeg } from "@/domain/organiser-panel";
import type { EventState } from "../event-state";
import type { AdminLinkCheck } from "./admin-link";
import {
  alertShown,
  announcement,
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
      "a read after an action ends a refresh still running: that one read the board before the action",
      ready({ refreshing: 3 }),
      { type: "reread", legs: after },
      ready({ panel: { ...links, legs: after } }),
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
  const board: EventState = [];
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
  ])("is nothing when %s", (_, panelSent, boardSent) => {
    expect(screenRead(panelSent as never, boardSent as never)).toBeUndefined();
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
