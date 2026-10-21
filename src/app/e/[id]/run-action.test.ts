import { describe, expect, it, vi } from "vitest";
import type { EventState } from "./event-state";
import { actionRunner, sendAction, stateOf, stateRead, stateShown } from "./run-action";

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

const header = { title: "Tournoi de Rennes", location: "Gymnase", allerAt: "2026-12-12 07:30:00", retourAt: null };

describe("stateOf", () => {
  const state = { event: header, legs: [{ leg: "aller", cars: [], withoutCar: [], device: [] }] };

  it("is the state an action gives back, refusal included", () => {
    expect(stateOf({ ok: true, state })).toBe(state);
    expect(stateOf({ ok: false, error: "seatTaken", state })).toBe(state);
  });

  it("is nothing for an answer without one", () => {
    expect(stateOf({ ok: false, error: "eventNotFound" })).toBeUndefined();
    expect(stateOf(undefined)).toBeUndefined();
    expect(stateOf({ ok: true, state: "nope" })).toBeUndefined();
  });

  // Epic #250: the header comes with the legs. An answer without it (legs alone, from a server
  // not yet deployed) is not applied: the page would lose its title.
  it.each<[string, unknown]>([
    ["the legs alone", state.legs],
    ["no header", { legs: state.legs }],
    ["no legs", { event: header }],
    ["a header that is not an object", { event: "Tournoi", legs: state.legs }],
  ])("is nothing for a state with %s", (_, given) => {
    expect(stateOf({ ok: true, state: given })).toBeUndefined();
  });
});

// Review of #305: the device's first read and `apply` are guarded as an action's answer is.
describe("stateRead", () => {
  const state = { event: header, legs: [] };

  it("is the state a read answered", () => {
    expect(stateRead({ ok: true, value: state })).toBe(state);
  });

  it.each<[string, unknown]>([
    ["a failure", { ok: false, problem: "failed" }],
    ["an unknown event", { ok: true, value: undefined }],
    ["the legs alone", { ok: true, value: [] }],
    ["no read at all", undefined],
  ])("is nothing for %s", (_, sent) => {
    expect(stateRead(sent as never)).toBeUndefined();
  });
});

describe("stateShown", () => {
  const withRetour: EventState = { event: { ...header, retourAt: "2026-12-12 18:00:00" }, legs: [] };
  const withoutRetour: EventState = { event: header, legs: [] };

  it("shows nothing that is not a state: the legs alone change nothing, and throw nothing", () => {
    expect(stateShown(withRetour, [])).toBeUndefined();
    expect(stateShown(withRetour, { legs: [] })).toBeUndefined();
  });

  it.each<[string, EventState, EventState, boolean]>([
    ["the retour removed: the tabs go", withRetour, withoutRetour, true],
    ["a retour added: the tabs come", withoutRetour, withRetour, true],
    ["the retour kept", withRetour, { ...withRetour, legs: [] }, false],
    ["still no retour", withoutRetour, { ...withoutRetour, legs: [] }, false],
  ])("%s", (_, before, next, tabsChange) => {
    expect(stateShown(before, next)).toStrictEqual({ state: next, tabsChange });
  });
});

describe("actionRunner", () => {
  const state: EventState = { event: header, legs: [{ leg: "aller", cars: [], withoutCar: [], device: [] }] };

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

  // #222: only a send that goes covers what an earlier one says (`Send.leaves`).
  it("says a run goes, offline too; never a second run dropped while the first is on its way", async () => {
    const { told, run } = page();
    let answer: (value: unknown) => void = () => {};
    const [first, dropped, offline] = [vi.fn(), vi.fn(), vi.fn()];
    const sent = run("cell", () => new Promise((resolve) => (answer = resolve)), undefined, first);
    await run("cell", async () => ({ ok: true, state }), undefined, dropped);
    answer({ ok: true, state });
    await sent;
    told.connected = false;
    await run("cell", async () => ({ ok: true, state }), undefined, offline);
    expect([first.mock.calls.length, dropped.mock.calls.length, offline.mock.calls.length]).toEqual([1, 0, 1]);
  });
});
