import { describe, expect, it } from "vitest";
import type { OrganiserLeg } from "@/domain/organiser-panel";
import type { EventState } from "../event-state";
import type { AdminLinkCheck } from "./admin-link";
import { announcement, screenRead, screenReducer, type ScreenEvent, type ScreenState } from "./screen-state";

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
  ...fields,
});

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
    ["nothing without the panel", { state: "failed", retrying: true }, ""],
  ])("%s", (_, state, said) => {
    expect(announcement(state)).toBe(said);
  });
});
