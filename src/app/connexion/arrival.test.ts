import { describe, expect, it, vi } from "vitest";
import { noteArrival, onArrival } from "./arrival";

describe("arrival", () => {
  // OA5.2: the bar of the page the link leads to hears that a session has just opened.
  it("tells whoever listens that a session has just opened", () => {
    const heard = vi.fn();
    const stop = onArrival(heard);
    noteArrival();
    noteArrival();
    expect(heard).toHaveBeenCalledTimes(2);
    stop();
  });

  it("tells no one that stopped listening", () => {
    const heard = vi.fn();
    onArrival(heard)();
    noteArrival();
    expect(heard).not.toHaveBeenCalled();
  });

  // Nothing is noted in the page's memory: a reload or a later visit finds no arrival to tell.
  it("tells nothing to a listener that comes after", () => {
    noteArrival();
    const heard = vi.fn();
    const stop = onArrival(heard);
    expect(heard).not.toHaveBeenCalled();
    stop();
  });
});
