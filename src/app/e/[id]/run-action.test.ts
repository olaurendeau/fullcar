import { describe, expect, it, vi } from "vitest";
import { sendAction, stateOf } from "./run-action";

const online = () => true;
const offline = () => false;

describe("sendAction", () => {
  it("gives the server's answer", async () => {
    expect(await sendAction(async () => ({ ok: true }), online)).toEqual({ ok: true, value: { ok: true } });
  });

  it("offline: sends nothing, and says so", async () => {
    const action = vi.fn(async () => "sent");
    expect(await sendAction(action, offline)).toEqual({ ok: false, problem: "offline" });
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
    expect(await sendAction(action, online)).toEqual({ ok: false, problem: "failed" });
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
