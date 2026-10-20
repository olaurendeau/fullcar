import { describe, expect, it, vi } from "vitest";
import type { BarMessage } from "@/components/event/message-bar";
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

  /** A page that records the bar's messages and the states the runner gives it, and a connection that can be cut. */
  function page() {
    const told: { messages: (BarMessage | null)[]; states: EventState[]; connected: boolean } = {
      messages: [],
      states: [],
      connected: true,
    };
    const run = actionRunner(
      { message: (message) => told.messages.push(message), state: (next) => told.states.push(next) },
      () => told.connected,
    );
    return { told, run };
  }

  it("replaces the message when the action ends, without clearing it first: « Fermer » stays", async () => {
    const { told, run } = page();
    told.connected = false;
    await run("seat", async () => ({ ok: true, state }));
    expect(told.messages).toEqual([{ kind: "problem", problem: "offline" }]);
    told.connected = true;
    await run("seat", async () => {
      throw new Error("500");
    });
    expect(told.messages).toEqual([
      { kind: "problem", problem: "offline" },
      { kind: "problem", problem: "failed" },
    ]);
  });

  it("a success message stays while the next action is sent, however long, and is replaced as it ends (v4-7)", async () => {
    vi.useFakeTimers();
    const { told, run } = page();
    // The page says a success; the runner only replaces the bar's message when an action ends.
    const placed: BarMessage = { kind: "done", text: "Tom et Léa sont dans la voiture de Sophie" };
    told.messages.push(placed);
    let answer: (value: unknown) => void = () => {};
    const next = run("seat", () => new Promise((resolve) => (answer = resolve)));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(told.messages).toEqual([placed]);
    answer({ ok: false, error: "rideGone", state });
    await next;
    expect(told.messages).toEqual([placed, null]);
    vi.useRealTimers();
  });

  it("an answer closes the message and gives the page the state the server sends, refusal included", async () => {
    const { told, run } = page();
    await run("seat", async () => ({ ok: false, error: "seatTaken", state }));
    expect(told.messages).toEqual([null]);
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
