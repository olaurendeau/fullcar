import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Sent } from "../run-action";
import { POLL_READS, startPendingPoll } from "./pending-poll";
import { POLL_MS, type ScreenEvent } from "./screen-state";

const EMAIL = "claire.martin@exemple.fr";
const panel = (send: string): Sent<unknown> => ({ ok: true, value: { state: "panel", legs: [], pending: { email: EMAIL, send } } });

/** The poll the hook runs, with `answers` given in turn (the last one again), and what it dispatched. */
function run(answers: Sent<unknown>[]) {
  const read = vi.fn(async () => answers[Math.min(read.mock.calls.length - 1, answers.length - 1)]);
  const events: ScreenEvent[] = [];
  const stop = startPendingPoll(read, (event) => events.push(event));
  return { read, events, stop };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("startPendingPoll: the notice read again while its email is on its way (OA1.7)", () => {
  it("reads every POLL_MS, and stops by itself once the notice says something else", async () => {
    const { read, events } = run([panel("sending"), panel("sending"), panel("failed")]);
    await vi.advanceTimersByTimeAsync(POLL_MS - 1);
    expect(read).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3 * POLL_MS);
    expect(read).toHaveBeenCalledTimes(3);
    expect(events.at(-1)).toStrictEqual({ type: "pendingRead", pending: { email: EMAIL, send: "failed" } });
    await vi.advanceTimersByTimeAsync(10 * POLL_MS);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("stops once confirmed elsewhere: a panel without a notice (OA2.6)", async () => {
    const { read, events } = run([{ ok: true, value: { state: "panel", legs: [] } }]);
    await vi.advanceTimersByTimeAsync(10 * POLL_MS);
    expect(read).toHaveBeenCalledTimes(1);
    expect(events).toStrictEqual([{ type: "pendingRead" }]);
  });

  it.each<[string, Sent<unknown>]>([
    ["the server keeps failing", { ok: false, problem: "failed" }],
    ["offline", { ok: false, problem: "offline" }],
    ["it answers something other than the panel", { ok: true, value: { state: "pending" } }],
    ["it keeps answering « sending »", panel("sending")],
  ])("gives up after POLL_READS reads, 30 s, when %s: the notice then reads as a failure", async (_, answer) => {
    expect(POLL_READS * POLL_MS).toBe(30_000);
    const { read, events } = run([answer]);
    await vi.advanceTimersByTimeAsync(POLL_READS * POLL_MS);
    expect(read).toHaveBeenCalledTimes(POLL_READS);
    expect(events.at(-1)).toStrictEqual({ type: "pendingGaveUp" });
    await vi.advanceTimersByTimeAsync(10 * POLL_MS);
    expect(read).toHaveBeenCalledTimes(POLL_READS);
    expect(events.filter((event) => event.type === "pendingGaveUp")).toHaveLength(1);
  });

  it("once stopped, reads nothing more, and applies nothing of a read still on its way", async () => {
    let answer: (sent: Sent<unknown>) => void = () => {};
    const read = vi.fn(() => new Promise<Sent<unknown>>((resolve) => (answer = resolve)));
    const events: ScreenEvent[] = [];
    const stop = startPendingPoll(read, (event) => events.push(event));
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(read).toHaveBeenCalledTimes(1);
    stop();
    answer(panel("sent"));
    await vi.advanceTimersByTimeAsync(10 * POLL_MS);
    expect(read).toHaveBeenCalledTimes(1);
    expect(events).toStrictEqual([]);
  });
});
