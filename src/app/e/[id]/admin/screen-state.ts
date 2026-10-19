import type { OrganiserLeg } from "@/domain/organiser-panel";
import type { EventState } from "../event-state";
import type { Sent } from "../run-action";
import type { AdminLinkCheck } from "./admin-link";

/*
 * The organiser area's state (epic #154, #182), pure: the first read of the panel and its
 * « Réessayer », then « Actualiser », a read of the screen that succeeds or fails as one
 * block, with one state and one message (O1.9).
 */

/** The panel as last read: the two links, and its legs. */
export interface Panel {
  publicUrl: string;
  adminUrl: string;
  legs: OrganiserLeg[];
}

export type ScreenState =
  | { state: "loading" }
  | { state: "invalid" }
  | { state: "failed"; retrying: boolean }
  | {
      state: "ready";
      panel: Panel;
      /** The number of the read running, if one is. */
      refreshing: number | null;
      /** The failures in a row, said by the alert until the next read starts. */
      refreshFailed: number;
      /** The last read succeeded, said by the status region. */
      refreshed: boolean;
    };

export type ScreenEvent =
  /** The first read, a « Réessayer » starting (failed, retrying) or ending: what `useAdminLinkCheck` says. */
  | { type: "checked"; check: AdminLinkCheck }
  | { type: "refreshStarted"; read: number }
  /** With the panel's legs on a success; without, a failure. */
  | { type: "refreshEnded"; read: number; legs?: OrganiserLeg[] };

function fromCheck(check: AdminLinkCheck): ScreenState {
  switch (check.state) {
    case "checking":
      return { state: "loading" };
    case "invalid":
      return { state: "invalid" };
    case "failed":
      return { state: "failed", retrying: check.retrying ?? false };
    case "valid": {
      const { publicUrl, adminUrl, legs } = check;
      return { state: "ready", panel: { publicUrl, adminUrl, legs }, refreshing: null, refreshFailed: 0, refreshed: false };
    }
  }
}

/**
 * The next state. A refresh starts only on the panel, and while none runs (O1.8). Only the
 * latest read counts: the end of any other changes nothing, nor does it once the link was
 * checked again.
 */
export function screenReducer(state: ScreenState, event: ScreenEvent): ScreenState {
  if (event.type === "checked") return fromCheck(event.check);
  if (state.state !== "ready") return state;
  if (event.type === "refreshStarted") {
    return state.refreshing === null ? { ...state, refreshing: event.read, refreshed: false } : state;
  }
  if (state.refreshing !== event.read) return state;
  if (!event.legs) return { ...state, refreshing: null, refreshFailed: state.refreshFailed + 1 };
  return { ...state, panel: { ...state.panel, legs: event.legs }, refreshing: null, refreshFailed: 0, refreshed: true };
}

/**
 * What a read of the screen gives, once both reads have ended: the panel's legs and the
 * board's state together, or nothing at all when either failed (O1.9). A link no longer
 * valid, or a board's state `undefined`, is a failure too.
 */
export function screenRead(
  panel: Sent<unknown>,
  board: Sent<EventState | undefined>,
): { legs: OrganiserLeg[]; board: EventState } | undefined {
  if (!panel.ok || !board.ok || !Array.isArray(board.value)) return undefined;
  const answer = panel.value as { state?: unknown; legs?: unknown } | null | undefined;
  if (answer?.state !== "panel" || !Array.isArray(answer.legs)) return undefined;
  return { legs: answer.legs as OrganiserLeg[], board: board.value };
}

/**
 * What the live regions of the title line say (O1.8, O1.9, O5.4): « Actualisation… » while a
 * read runs, then its outcome. The alert is empty while a read runs, so that two failures in
 * a row are announced twice.
 */
export function announcement(state: ScreenState): "" | "refreshing" | "refreshed" | "failed" {
  if (state.state !== "ready") return "";
  if (state.refreshing !== null) return "refreshing";
  if (state.refreshFailed > 0) return "failed";
  return state.refreshed ? "refreshed" : "";
}
