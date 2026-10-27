import type { DeviceState, EventState } from "./event-state";

/** For tests only: the state of an event not anonymised, failing the test had it ended. */
export function stillOpen(state: DeviceState): EventState;
export function stillOpen(state: DeviceState | undefined): EventState | undefined;
export function stillOpen(state: DeviceState | undefined): EventState | undefined {
  if (state !== undefined && "ended" in state) throw new Error("the event ended");
  return state;
}
