import { describe, expect, it, vi } from "vitest";
import type { EventState } from "./event-state";
import { actionRunner, sendAction, stateOf } from "./run-action";

describe("sendAction", () => {
  it("offline: sends nothing, and says so", async () => {
    const action = vi.fn(async () => "sent");
    expect(await sendAction(action, () => false)).toEqual({ ok: false, problem: "offline" });
    expect(action).not.toHaveBeenCalled();
  });

  it("a request lost with the connection is offline", async () => {
    let connected = true;
    const action = async () => {
      connected = false;
      throw new TypeError("Failed to fetch");
    };
    expect(await sendAction(action, () => connected)).toEqual({ ok: false, problem: "offline" });
  });

  it("a server error, online, is the generic failure, without its detail", async () => {
    const action = async () => {
      throw new Error("An unexpected response was received from the server.");
    };
    expect(await sendAction(action, () => true)).toEqual({ ok: false, problem: "failed" });
  });
});

describe("stateOf", () => {
  const state = [{ leg: "aller", cars: [], withoutCar: [], device: [] }];

  it("is the state an action gives back, refusal included", () => {
    expect(stateOf({ ok: true, state })).toBe(state);
    expect(stateOf({ ok: false, error: "seatTaken", state })).toBe(state);
  });

  it("is nothing for an answer without one", () => {
    expect(stateOf({ ok: false, error: "eventNotFound" })).toBeUndefined();
    expect(stateOf(undefined)).toBeUndefined();
    expect(stateOf({ ok: true, state: "nope" })).toBeUndefined();
  });
});

describe("actionRunner", () => {
  const state: EventState = [{ leg: "aller", cars: [], withoutCar: [], device: [] }];

  /** A page that records the states the runner gives it and each action that ends, and a connection that can be cut. */
  function page() {
    const told = { states: [] as EventState[], ended: 0, connected: true };
    const run = actionRunner({ state: (next) => told.states.push(next), ended: () => (told.ended += 1) }, () => told.connected);
    return { told, run };
  }

  // The page says what came of an action, in the bar or in its sheet (#216): the runner writes nothing there.
  it("each action that runs ends once, whatever came of it; a second run of it meanwhile does not", async () => {
    const { told, run } = page();
    told.connected = false;
    await run("seat", async () => ({ ok: true, state }));
    told.connected = true;
    let answer: (value: unknown) => void = () => {};
    const first = run("seat", () => new Promise((resolve) => (answer = resolve)));
    await run("seat", async () => ({ ok: true, state }));
    answer({ ok: false, error: "seatTaken", state });
    await first;
    expect(told.ended).toBe(2);
  });

  it("an answer gives the page the state the server sends, refusal included", async () => {
    const { told, run } = page();
    await run("seat", async () => ({ ok: false, error: "seatTaken", state }));
    expect(told.states).toEqual([state]);
  });

  it("the control is sending until the answer, and a second tap meanwhile sends nothing", async () => {
    const { run } = page();
    let answer: (value: unknown) => void = () => {};
    const action = vi.fn(() => new Promise((resolve) => (answer = resolve)));
    const sending = vi.fn();
    const first = run("seat", action, sending);
    expect(sending.mock.calls).toEqual([[true]]);
    expect(await run("seat", action, sending)).toBeUndefined();
    expect(action).toHaveBeenCalledTimes(1);

    answer({ ok: true, state });
    expect(await first).toEqual({ ok: true, value: { ok: true, state } });
    expect(sending.mock.calls).toEqual([[true], [false]]);
  });
});
